# Performance review

Date: 2026-07-01 ; scope: working tree (uncommitted changes included) ; method: Prisma query-vs-index cross-check across every `findMany`/`findFirst`/`count`/`updateMany`/`deleteMany` under `packages/*/src/server`, plus a Next.js App Router frontend audit (bundle, caching, waterfalls, polling).

Three layers: **request path** (RBAC guard cost, auth verification, event-bus/SMTP coupling, the authed-layout waterfall), **database** (query shapes vs declared indexes, pagination, transaction hygiene), and **frontend** (react-query cache posture, code-splitting, SSR/hydration, polling). Note: `services/api/src` holds no direct Prisma calls — it only wires tRPC routers ; all query logic lives in `packages/*/src/server`.

The single biggest end-user latency win is the pair **RP-H2 + FE-H3** (local JWT verification + de-waterfalling the authed layout). The biggest tail-latency win on mutations is **RP-H3** (SMTP out of the request path).

## Request path

### High

**RP-H1. `rbac.myPermissions` fans out ~2 DB queries per registered permission**
[packages/rbac/src/server/index.ts](../../packages/rbac/src/server/index.ts):84-88 maps every registered permission through `hasPermission`, and each call runs `findActiveAssignments` (`roleAssignment.findMany` with `include: { role: true }`) **plus** a `rolePermission.findFirst` ([read.ts](../../packages/rbac/src/server/read.ts):94-112). With N registered permissions (N grows with every module), that is up to 2×N queries per `myPermissions` call — a query the web app issues for permission-gated UI. For a non-admin user none of the short-circuits apply, so all 2×N fire (60-100 round-trips at 30-50 permissions).
Fix: fetch `findActiveAssignments(userId, orgId)` once, short-circuit ADMIN/SYSADMIN, then a single `rolePermission.findMany({ where: { roleId: { in: roleIds } } })` and intersect in memory.

**RP-H2. Per-request Supabase Auth network call in the tRPC context, uncached**
[services/api/src/trpc/context.ts](../../services/api/src/trpc/context.ts):20-21 → [lib/supabase.ts](../../services/api/src/lib/supabase.ts):25-40 calls `supabase.auth.getUser(token)` on **every** tRPC request (including batched GET queries) — a full HTTPS round-trip to Supabase Auth before the procedure starts (30-200 ms added per request, plus a hard availability dependency on Supabase for every read).
Fix: verify the JWT locally with the project JWKS/JWT secret (`jose.jwtVerify`) — what the token is designed for ; fall back to `auth.getUser` only for revocation-sensitive paths, or cache verification keyed by token hash with a TTL ≤ token lifetime.

**RP-H3. `emit()` runs all subscribers synchronously inside the request path, including SMTP sends**
[packages/common/src/events.ts](../../packages/common/src/events.ts):14-33 awaits handlers sequentially ; the notification subscribers each `await notify(...)`, which `await sendMail(...)` ([dispatch.ts](../../packages/notifications/src/server/dispatch.ts):129-149). Call sites `await emit(event)` before returning ([users/src/server/index.ts](../../packages/users/src/server/index.ts):209). So a password change / TOTP toggle / email change blocks on user lookup + branding query + prefs query + dedupe query + Notification insert + a **synchronous SMTP round-trip (0.5-5 s)** + the webhook subscriber's queries + outbox inserts, all before the tRPC response returns. A slow SMTP provider directly inflates p99 of security-sensitive mutations.
Fix: make `emit` schedule handlers via `setImmediate`/microtask and return immediately (the bus is documented best-effort), or persist the Notification row synchronously but fire the email transport asynchronously through an outbox like webhooks already do.

### Medium

**RP-M1. RBAC guard adds 1-2 uncached queries to every gated procedure, no per-request memoization** — [guards.ts](../../packages/rbac/src/server/guards.ts):29-43 → `hasPermission` on every call ; a procedure checking two permissions pays twice, and `requireAdmin` re-runs `hasAnyAdminAssignment` per procedure. This is the hottest path in the API and scales 1:1 with traffic. Fix: memoize `findActiveAssignments` per request (stash a lazy promise on `ctx`), or a short-TTL LRU keyed on `(userId, orgId)` — role changes are rare and already emit events that could bust the cache.

**RP-M2. Webhook wildcard subscriber queries subscriptions on every event** — [subscribers.ts](../../packages/webhooks/src/server/subscribers.ts):61 runs two `webhookSubscription.findMany` per emitted event, in-line with the mutation (via RP-H3), even on deploys with zero endpoints. Fix: cache the small subscription table with a short TTL, invalidated on endpoint mutations.

**RP-M3. Webhook delivery worker is fully sequential with head-of-line blocking** — [worker.ts](../../packages/webhooks/src/server/worker.ts):62-76 loops `await deliverOne(delivery)` over a batch of 50 ; one unresponsive receiver stalls the whole batch (50 × timeout), starving healthy endpoints while `inFlight` no-ops subsequent ticks. Fix: bounded concurrency (`p-limit(5-10)`), grouped per endpoint to preserve per-endpoint ordering.

**RP-M4. Calendar reminder sweep is a sequential N+1 pyramid** — [services/api/src/server.ts](../../services/api/src/server.ts):108-145: up to 100 reminders × ~50 members = up to 5,000 sequential `notify` calls, each with its own user/prefs/dedupe/branding queries and a possible SMTP send, every 60 s — the sweep can outlast its own interval. Fix: dedupe member lookups per tick, hoist the per-`notify` invariants (org branding is identical for all), bulk-insert Notification rows, bounded-concurrency mail.

**RP-M5. `resolveOrgBranding()` runs a DB query on every single `notify()`** — [dispatch.ts](../../packages/notifications/src/server/dispatch.ts):81 → `organization.findMany({ take: 2 })` per dispatch for a logo/color that change ~never. Fix: cache with a 60 s TTL or invalidate on `organization.updated`.

### Low

- **RP-L1.** No response compression on the Express API ([services/api/src/server.ts](../../services/api/src/server.ts):280-301 is `httpLogger`, `cors`, `express.json()` only) — large tRPC batch responses ship uncompressed unless the proxy handles it. Add `compression()` or document the proxy.
- **RP-L2.** Production API runs under `tsx` (on-the-fly transpile) — slower cold start, higher baseline memory. Precompile with `tsc`/`esbuild` and run `node dist/server.js`.
- **RP-L3.** TOTP recovery-code check does up to ~10 sequential bcrypt compares on the event loop ([totp.ts](../../packages/auth/src/server/totp.ts):194-199) — rare path ; prefer native `bcrypt` (libuv threadpool) or an HMAC lookup column if it surfaces.

### Request-path done well

The wildcard subscriber skips membership lookup unless needed ; the outbox gives at-least-once durability with idempotency keys ; exponential backoff with cap + auto-disable after consecutive failures ; the worker timer is `unref()`ed with a re-entrancy guard ; delivery listing strips the `payload` column deliberately ; SMTP transport is a cached singleton ; registries are bounded by code, not data (no memory leaks found).

## Database

### High

**DB-H1. `Project.listProjects` — unbounded, unindexed sort, ILIKE search**
[packages/projects/src/server/data.ts](../../packages/projects/src/server/data.ts):137-160. Filter `organizationId + deletedAt` is covered by `@@index([organizationId, deletedAt])`, but there is **no `take`** (the whole org's projects are materialized), `orderBy: [{updatedAt:desc},{id:desc}]` is **not indexed** (full sort every call), and the search uses `contains … mode:"insensitive"` (unindexable ILIKE). This is a public/admin list endpoint that degrades linearly with an org's project count.
Fix: add cursor pagination + `take` ; add `@@index([organizationId, updatedAt])` ; add a `pg_trgm` GIN index on `title`/`slug` (or full-text) if search stays.

**DB-H2. `Invite.listPendingInvitesForAdmin` — cross-org unpaginated full scan**
[packages/organizations/src/server/data.ts](../../packages/organizations/src/server/data.ts):160-191. `where: acceptedAt: null` (unindexed), `organizationId` not filtered (so `@@index([organizationId])` is unused), optional `email contains` insensitive (can't use `@@index([email])`), and **no `take`**. The common (no-roleId) case is a full `Invite` table scan feeding the admin users directory ; it scales with total invites across all orgs.
Fix: paginate (`take` + cursor) ; add a partial index `WHERE acceptedAt IS NULL` ; trigram index for email search.

### Medium

**DB-M1. `Notification.list` — filter covered, sort not co-indexed** — [notifications/src/server/router.ts](../../packages/notifications/src/server/router.ts):103-123. Filter matches `@@index([userId, channel, dismissedAt])`, but the `createdAt` sort/cursor is not in that index, so Postgres index-scans then sorts. Fix: `@@index([userId, channel, dismissedAt, createdAt])` and, for the unread variant, `@@index([userId, channel, readAt, createdAt])`.

**DB-M2. `CalendarEvent.listEventsForDay` — day-range not co-indexed** — [calendar/src/server/data.ts](../../packages/calendar/src/server/data.ts):152-162. Only single-column indexes exist (`startAt`, `calendarId`, `organizationId`) ; the planner uses at most one, leaving the equality (org/calendar) + range (startAt) + sort uncovered. This is the primary calendar-view query. Fix: `@@index([calendarId, startAt])` or `@@index([organizationId, startAt])`.

**DB-M3. `CalendarEvent.searchCalendarEvents` — ILIKE title/description scan** — [calendar/src/server/data.ts](../../packages/calendar/src/server/data.ts):293-306. Output is bounded (`take: 25`) but the match scan is sequential over the org's events. Fix: `pg_trgm` GIN index or a `tsvector` column.

**DB-M4. `User.listUsers` (admin directory) — unindexed filters + unindexed sort** — [users/src/server/data.ts](../../packages/users/src/server/data.ts):40-93. `User` has only `email @unique` — no index on `createdAt` (the sort column), `disabledAt`, `deletedAt`, or `emailVerifiedAt`. Paginated, but every page scans and sorts. Fix: `@@index([createdAt, id])` for the sort ; `@@index([deletedAt, disabledAt])` for status facets ; trigram for name/email search.

**DB-M5. `User.processExpiredDeletions` (cron) — full-table scan on unindexed `deletedAt`** — [auth/src/server/account-lifecycle.ts](../../packages/auth/src/server/account-lifecycle.ts):71-78. `where: deletedAt: { lte, not: null }` with no index → sequential scan every cron run, growing with the user table. Fix: partial `@@index([deletedAt]) WHERE deletedAt IS NOT NULL`.

**DB-M6. `Organization.listOrganizationsForAdmin` — unindexed `deletedAt` + sort + ILIKE** — [organizations/src/server/data.ts](../../packages/organizations/src/server/data.ts):93-117. Same unindexed-sort pattern as M4 ; low at small org counts, rises with growth. Fix: `@@index([deletedAt, createdAt])` when org counts grow.

### Low

- **DB-L1.** `WebhookSubscription.findMatchingEndpoints` prefix path scans on non-leading `isPrefix`, and `select: { endpoint: true }` over-fetches the full endpoint row when only `id/status/organizationId` are used ([webhooks/src/server/data.ts](../../packages/webhooks/src/server/data.ts):158-190). Optional: partial index `WHERE isPrefix = true` ; narrow the select.
- **DB-L2.** `FeatureFlagOverride` reads sort on unindexed `setAt`, but per-flag override sets are tiny — hot path is fine ([feature-flags/src/server/data.ts](../../packages/feature-flags/src/server/data.ts):74-91).
- **DB-L3.** `Invite.listPendingInvitesForOrg` — unindexed `acceptedAt`/sort, no `take`, bounded per org ([organizations/src/server/data.ts](../../packages/organizations/src/server/data.ts):124-143).
- **DB-L4.** `TrustedDevice.listTrustedDevices` sorts on unindexed `lastSeenAt` ; small per-user set ([auth/src/server/trusted-devices.ts](../../packages/auth/src/server/trusted-devices.ts):233-238).
- **DB-L5.** `calendar.listCalendarMembers` relation-subquery user list, no `take`, bounded by org size ([calendar/src/server/data.ts](../../packages/calendar/src/server/data.ts):372-378).
- **DB-L6.** `PROJECT_DETAIL_INCLUDE` deep include is used only on single-row reads ; lists correctly include only `industries`. No action.

### Transaction hygiene

**No network-in-transaction found.** Webhook delivery `$transaction`s ([webhooks/src/server/data.ts](../../packages/webhooks/src/server/data.ts):275-341) are DB-only ; the HTTP POST runs in the worker outside the tx. The event-bus fan-out ([webhooks/src/server/subscribers.ts](../../packages/webhooks/src/server/subscribers.ts):52-152) runs outside the source mutation's transaction. All other `$transaction`s (rbac, organizations, projects, feature-flags, calendar) are DB-only. This is done right.

### Well-matched models (no action)

RoleAssignment, OrganizationMembership, Notification dedupe + unreadCount, `WebhookDelivery.listPendingDueDeliveries` (`@@index([status, nextAttemptAt])` exactly matches the query), `CalendarEventReminder.getPendingReminders`, EmailResendAttempt, User/Organization metadata tables, FeatureFlagOverride write path, TrustedDevice/DeviceSession lookups, Role, and Project/Industry point reads all lead on an indexed column matching their filter and sort. The outbox and reminder-sweep queries are textbook.

## Frontend

### High

**FE-H1. Global `invalidateQueries()` on every token refresh nukes the whole cache**
[services/web/src/lib/trpc-provider.tsx](../../services/web/src/lib/trpc-provider.tsx):43-55. `onAuthStateChange` calls a bare `queryClient.invalidateQueries()` (no filter) on `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, and `USER_UPDATED`. `TOKEN_REFRESHED` fires periodically (Supabase auto-refreshes ~hourly and on focus near expiry), so the deliberate `staleTime: Infinity` on breadcrumbs, nav admin-status, `users.me`, roles, and org lookups is overridden by periodic full-app refetch bursts the user never triggered.
Fix: do nothing on `TOKEN_REFRESHED` (the fresh token is picked up by the header callback on the next request) ; `queryClient.clear()` on `SIGNED_OUT` ; targeted invalidation for `USER_UPDATED` ; broad invalidation only on `SIGNED_IN`.

**FE-H2. Heavy client libraries statically imported — zero `next/dynamic` anywhere**
A grep for `next/dynamic|React.lazy` across `services/web/src` returns 0 matches. Eagerly bundled: `@tanstack/react-table` + all three `@dnd-kit` packages via `DataTable` ([data-table.tsx](../../services/web/src/components/patterns/data-table/data-table.tsx):12-39, imported by every list surface) ; `@tiptap/*` (StarterKit + ProseMirror) reached through the **synchronous** field registry ([fields/registry.tsx](../../services/web/src/components/fields/registry.tsx):8), so any `AutoForm` pulls the full editor even for forms with no rich-text field ; `react-easy-crop` on every profile page ([account/profile-section.tsx](<../../services/web/src/app/(authed)/account/profile-section.tsx>):21) though it's used only in a usually-closed dialog ; `react-day-picker` in the calendar popovers.
Fix: `next/dynamic(..., { ssr: false, loading: <Skeleton/> })` for `DataTable` ; lazy the rich-text branch in the registry so non-rich-text forms never ship TipTap ; `dynamic()` the crop dialog and date pickers.

**FE-H3. The authed layout performs a ~4-hop sequential network waterfall on every navigation**
[services/web/src/app/(authed)/layout.tsx](<../../services/web/src/app/(authed)/layout.tsx>):54-113, with [middleware.ts](../../services/web/src/middleware.ts):54 ahead of it. In order, per authed request: (1) middleware `supabase.auth.getUser()` ; (2) `isSystemBootstrapped()` → uncached tRPC `organizations.bootstrapStatus` ; (3) `supabase.auth.getUser()` again ; (4) `isCurrentDeviceTrusted` → **two sequential** tRPC calls (`featureFlags.get`, then `auth.trustedDevices.currentDeviceId`), each re-verifying the token against Supabase inside the API context (RP-H2) ; (5) `users.me`. That is ~5 Supabase Auth verifications and 4+ sequential HTTP hops before rendering starts — the dominant TTFB cost of the whole app.
Fix: cache `bootstrapStatus` in-process (it flips once per deploy lifetime) ; run `isCurrentDeviceTrusted` and `users.me` in parallel ; collapse the two trusted-device calls into one procedure ; fix RP-H2 so each hop stops re-verifying over the network ; consider `React.cache()` for per-request dedupe.

### Medium

**FE-M1. No global react-query defaults → over-fetch by default + 40+ hand-copied overrides** — [trpc-provider.tsx](../../services/web/src/lib/trpc-provider.tsx):16 constructs `new QueryClient()` with no `defaultOptions`, so every query defaults to `staleTime: 0` + `refetchOnWindowFocus: true`. The team pastes `refetchOnWindowFocus: false` into 40+ call sites ; several omit it and silently refetch on focus (e.g. [calendar/week-view.tsx](<../../services/web/src/app/(authed)/calendar/week-view.tsx>):276, [calendar/day-view.tsx](<../../services/web/src/app/(authed)/calendar/day-view.tsx>):154). Fix: set `defaultOptions.queries` to `{ staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 }` and delete the boilerplate, keeping only intentional deviations.

**FE-M2. No server-side prefetch / hydration for tRPC — list routes are client shells fetching on mount** — the server tRPC client is used only for layout gates and mutations. E.g. [admin/users/page.tsx](<../../services/web/src/app/(authed)/admin/users/page.tsx>):4-14 renders a client list that fires `bootstrapStatus`, `adminListRoles`, `adminListUsers`, `invites.adminListAll` from the browser after hydration, on top of the `getSession()` header round-trip. Fix: server `prefetchQuery` + `<HydrationBoundary state={dehydrate(queryClient)}>` for the primary list query per route. The calendar route already models the idea via `initialCalendars` ([calendar/page.tsx](<../../services/web/src/app/(authed)/calendar/page.tsx>):20-46) — generalize it.

**FE-M3. Notifications badge polls every 15s on every authed page** — [components/notifications-bell.tsx](../../services/web/src/components/notifications-bell.tsx):39,96-99 sets `refetchInterval: 15_000` + `refetchOnWindowFocus: true`, and the bell is mounted in the app bar on every `(authed)` route → a background tRPC batch every 15s for the life of every tab. Fix: raise to ~60s, pause when the document is hidden, or switch to Supabase realtime (already permitted in `connect-src`).

**FE-M4. Calendar shell eagerly imports all three heavy views** — [calendar/calendar-shell.tsx](<../../services/web/src/app/(authed)/calendar/calendar-shell.tsx>):19-21 statically imports `DayView`, `MonthView`, `WeekView` though only one renders at a time. Fix: `dynamic()` the two non-default views.

**FE-M5. `next.config.ts` missing perf settings** — [next.config.ts](../../services/web/next.config.ts):112-129 has no `experimental.optimizePackageImports` (lucide-react and radix are barrel-imported across dozens of files), no bundle analyzer, and no `images` config. Fix: add `optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"]` and wire `withBundleAnalyzer` behind an env flag.

### Low

- **FE-L1.** Raw `<img>` instead of `next/image` in [organization-logo.tsx](../../services/web/src/components/organization-logo.tsx):54 and [calendar/new-event-popover.tsx](<../../services/web/src/app/(authed)/calendar/new-event-popover.tsx>):183 — bypasses optimization ; user-uploaded logos can be large. Fix: `next/image` + an `images` remote-pattern allowlist.
- **FE-L2.** Minor `enabled:`-gated secondary-query waterfalls (role lists feeding filter dropdowns) ; main content isn't blocked. Where the org id is known server-side, pass it as a prop instead of round-tripping `bootstrapStatus`.
- **FE-L3.** [calendar/page.tsx](<../../services/web/src/app/(authed)/calendar/page.tsx>):18 `await api.calendar.calendars.ensurePersonal.mutate()` blocks render on every calendar load though seeding is needed once. Fix: fire-and-forget or gate on an empty `calendars.list`.

### Frontend done well

Server-side auth gating batches `getUser()` + `getSession()` via `Promise.all` and short-circuits anon users before any child fetch ; `staleTime: Infinity` on stable identity data (nav, breadcrumbs, account sidebar) is the right intent (only undercut by FE-H1) ; `placeholderData: keepPreviousData` on paginated lists avoids filter flicker ; `DataTable` memoizes column defs/order and the calendar views memoize their derivations ; `loading.tsx` catch-all keeps the AppBar during nav ; production security headers served from the edge keep middleware lean ; `next/font` self-hosts with `display: "swap"`.

## Build / tooling

- **BT-1 (Low).** Per-package `tsc --noEmit` re-typechecks the whole dependency graph as source (`tsconfig.base.json` maps `@monark/*` straight to `packages/*/src`, no project references) ; `turbo.json` `typecheck.dependsOn: ["^build"]` is a no-op (no package has a `build` script) and caches only logs, so `.tsbuildinfo` incrementality doesn't survive CI cache restores. CI typecheck cost is O(packages × graph). Fix: adopt TS project references (`composite` + `tsc -b`), or declare `outputs: ["*.tsbuildinfo"]` on the `typecheck` task.
- **BT-2 (Info).** `turbo.json` declares no `globalEnv`/`globalDependencies`, so build-time env vars (`NEXT_PUBLIC_*`) aren't in the cache hash — risk of stale cached `.next` output across env changes. Fix: add `"globalEnv": ["NEXT_PUBLIC_*", "NODE_ENV"]`.

## Remediation order

1. **RP-H2 + FE-H3** — local JWT verification + de-waterfall the authed layout ; the single biggest end-user latency win.
2. **RP-H3** — take SMTP (and webhook enqueue) out of the mutation request path ; biggest mutation-tail win.
3. **RP-H1 / RP-M1** — batch `myPermissions` and memoize the RBAC guard per request.
4. **FE-H1** — one-line change, removes periodic full-app refetch ; then **FE-M1** (global query defaults).
5. **DB-H1 / DB-H2** — add pagination + the missing indexes on the two queries that degrade with data volume on user-facing endpoints.
6. **FE-H2 / FE-M4** — code-split the heavy libs (bundle/TBT win).
7. **RP-M3 / RP-M4** — bounded concurrency for webhook delivery and the calendar sweep ; then **DB-M1/M2/M5** and **FE-M2/M3** ; Lows opportunistically.

The database layer is, on balance, well-indexed — the outbox, reminder-sweep, dedupe, and role-assignment paths are exemplary. The gaps cluster on the admin/list-and-search surfaces (projects, invites, users, calendar search), which share one root cause: list endpoints written without pagination or a sort-covering index. Fixing that pattern once, and codifying it (see the maintainability report and the collaboration section), closes most of the DB findings at their source.
