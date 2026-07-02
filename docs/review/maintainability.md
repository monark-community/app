# Code reusability & maintainability review

Date: 2026-07-01 ; scope: working tree (uncommitted changes included) ; corpus: 529 TS/TSX source files, ~65.7k lines (excluding `node_modules`, `.next`). Method: read CLAUDE.md as the standard, then hunted where the codebase violates or falls short of it, quantifying duplication where possible.

Headline: the architecture is genuinely good — a real shared-patterns library, a clean error model, perfect i18n key parity, near-zero TODO debt — but three things need attention now: **(1) the tree currently fails its own CI codegen gate** (calendar is unmanifested), **(2) ~40 copies of the auth/org preamble** exist because there's no `protectedProcedure`, and **(3) type-safety erosion is real but localized entirely to the calendar module.**

## Critical

### M-C1. `@monark/calendar` is absent from `modules.manifest.ts` — the tree fails its own CI codegen gate

- `packages/calendar/` is a full module wired into [services/api/src/server.ts](../../services/api/src/server.ts):34 and mounted in [app-router.generated.ts](../../services/api/src/trpc/app-router.generated.ts):7,18. But [modules.manifest.ts](../../modules.manifest.ts) lists 9 modules with **no calendar entry** (the uncommitted diff adds only `@monark/projects`).
- [tools/gen-routers.ts](../../tools/gen-routers.ts):26 and [tools/gen-events.ts](../../tools/gen-events.ts):29 derive strictly from `MODULES`, so **running `pnpm gen` now would delete `calendarRouter` from the app router and break the API.** The generated file in the tree can only have been produced by a manifest state that no longer exists. [.github/workflows/ci.yml](../../.github/workflows/ci.yml):74-75 runs `gen:*  --check`, so this tree fails CI on arrival.
- Same-root consequences: calendar has **no `contracts/events.ts`** → emits zero domain events → invisible to webhooks ; `tools/check-tiers.ts` doesn't police its deps ; it's absent from the `DomainEvent` union.
- Fix: add `"@monark/calendar": { tier: "extended" }` to the manifest, add `contracts/events.ts` + `registerEventTypes`, rerun `pnpm gen`, and extend `check-tiers.ts` to assert every `packages/*` with a `./server` export appears in the manifest so this can't recur.

## Duplication (quantified)

### M-D1. No `protectedProcedure` / `orgProcedure` — ~40 copies of the auth+org preamble (~250 lines)

[packages/common/src/trpc.ts](../../packages/common/src/trpc.ts):46 exports only `publicProcedure`, so every router hand-rolls the preamble. [packages/projects/src/server/index.ts](../../packages/projects/src/server/index.ts) repeats this verbatim **7 times in one file**:

```ts
if (!ctx.userId) throw new UnauthorizedError();
const org = await requireOrg({
  userId: ctx.userId,
  activeOrganizationId: ctx.activeOrganizationId,
});
await requirePermission(ctx, "projects.read", org.id);
```

Same shape across users (5), organizations (5), webhooks (10), rbac, and calendar — ~40 copies, each a chance to forget the `userId` check or the org-scope check (and the security review found exactly that class of omission in calendar). This is the **single highest-leverage refactor** and it is also a security control: fix M-D1 and H2/H3/H4 from the security report get structurally harder to reintroduce.
Fix: `authedProcedure` (asserts `ctx.userId`, narrows the type) and an `orgScopedProcedure(permission)` factory in `@monark/common/trpc`, plus a `requireOwnedEntity(fetch, orgId)` helper for the fetch-or-NotFound dance.

### M-D2. Dirty/baseline/revert form machinery hand-rolled 7× (~250 lines)

`useState`-per-field + hand-written `dirty` + `revert()` + hydrate effect in [role-editor.tsx](<../../services/web/src/app/(authed)/admin/rbac/role-editor.tsx>), [webhook-editor.tsx](<../../services/web/src/app/(authed)/admin/webhooks/webhook-editor.tsx>), [organization-detail.tsx](<../../services/web/src/app/(authed)/admin/organizations/[id]/organization-detail.tsx>), [project-form.tsx](<../../services/web/src/app/(authed)/projects/project-form.tsx>), industries-list.tsx, industry-edit-form.tsx, and [profile-section.tsx](<../../services/web/src/app/(authed)/account/profile-section.tsx>) — all sitting directly next to the shared `DirtyFormBar`. Fix: a `useFormBaseline<T>()` hook beside `DirtyFormBar` returning `{ values, set, dirty, revert }`. Also: `dirty-form-bar.tsx` lives at `src/components/`, outside `components/patterns/` and its barrel, despite CLAUDE.md listing it as a house pattern — move it in.

### M-D3. Mutation + toast + invalidate boilerplate ~40× — and 3 mutations fail silently

~75 `useMutation` sites ; ~40 follow the exact `onSuccess: toast + invalidate / onError: toast` template. Two error conventions coexist (`t("error", {message})` vs `err.message || t("error")`), and **3 mutations have no `onError` at all** so they fail silently: [notifications-section.tsx](<../../services/web/src/app/(authed)/account/notifications-section.tsx>):37-41, [admin-notifications.tsx](<../../services/web/src/app/(authed)/admin/users/[id]/admin-notifications.tsx>):52-56, [profile-section.tsx](<../../services/web/src/app/(authed)/account/profile-section.tsx>):53-55. Fix: a `useToastMutation` helper that makes error toasts the default (~250-300 lines saved and closes the silent failures).

### M-D4. Web-screen glue around the shared patterns is copy-paste (~30% of each screen)

The patterns library is genuinely used by all 7 list screens ; duplication lives in the wiring:

1. **Archive/restore/hard-delete lifecycle** duplicated wholesale between [projects-list.tsx](<../../services/web/src/app/(authed)/projects/projects-list.tsx>) and [industries-list.tsx](<../../services/web/src/app/(authed)/industries/industries-list.tsx>) — ~110 lines/screen, ~100 shared → extract `useArchiveLifecycle()` + `<ArchiveConfirmDialogs>`.
2. **Industry edit form exists twice** ([industries-list.tsx](<../../services/web/src/app/(authed)/industries/industries-list.tsx>):48-168 vs [industry-edit-form.tsx](<../../services/web/src/app/(authed)/industries/[id]/industry-edit-form.tsx>):11-120) — ~85% identical ; every other entity uses one component + `containment` prop. Merge into `industry-form.tsx`.
3. **Panel scaffold repeated 6×** (`PanelHeaderBar` + scroll container + sr-only `SheetTitle` + create/edit/skeleton switch) — ~100 removable lines → fold into `TableDetailLayout`.
4. **Org-scope picker** duplicated rbac ↔ webhooks (~40 lines ; the webhooks copy's own comment says "Mirrors the /admin/rbac manager pattern") → `useOrgScope()` + `<OrgScopePickerCard>`.
5. **Notification preference matrix** duplicated account ↔ admin (~115 lines, incl. a hand-rolled toggle pill duplicated in both while `ui/switch.tsx` exists) → one `<NotificationPrefsMatrix>` + `Switch`.
6. **Load-more pagination block** duplicated (~20 lines each).
7. **Micro-helpers with no `lib/` home:** `useDebounced` defined 3× (a canonical copy already exists at [components/fields/use-debounced.ts](../../services/web/src/components/fields/use-debounced.ts)) ; `slugify` byte-identical 3× ; `formatDate`/relative-time reimplemented **7×** with drifting signatures → `src/lib/{slugify,format-date}.ts`.

### M-D5. Cursor-pagination epilogue triplicated server-side (with the banned `!`)

`hasMore ? items[items.length - 1]!.id : null` in [notifications/router.ts](../../packages/notifications/src/server/router.ts):128, [organizations/data.ts](../../packages/organizations/src/server/data.ts):115, [users/data.ts](../../packages/users/src/server/data.ts):92. Fix: a `takePage(items, limit)` helper in `@monark/common` returning `{ items, nextCursor }` — kills the duplication and three banned non-null assertions at once.

### M-D6. Vitest integration configs — 7 near-copies of the same ~30-line file

`packages/{auth,feature-flags,notifications,organizations,rbac,users,webhooks}/vitest.integration.config.ts` set an identical block (globalSetup, assert-test-db setup, include glob, timeouts, `fileParallelism: false`, coverage dir) ; the only variance is comment wording (users' comment even says "Same shape as packages/rbac/..."). Plus 9 near-identical unit configs. Fix: export `defineIntegrationConfig(overrides?)` from `@monark/test-utils` (which already owns global-setup) — ~200 lines → ~25, and the next timeout tweak happens once.

### M-D7. Email templates — the shell abstraction stops too early

[\_partials/email-shell.ts](../../packages/notifications/src/templates/_partials/email-shell.ts) exists, but every template still inlines raw styled HTML: `color:#3f3f46` appears **42 times across 8 template files** (× en+fr), and the styled `<h1>` header is copy-pasted per template per locale. 10 templates, 627 lines, ~60% repeated scaffolding ; a brand change means editing ~20 blocks in lockstep and en/fr styling can silently diverge. Fix: add `heading()`, `paragraph()`, `button()`, `mutedFooter()` builders to `_partials/` ; templates keep only copy strings. (This also removes the M2 HTML-escaping risk from the security report if the builders escape by default.)

### M-D8. i18n value duplication (structure is clean)

[en.json](../../services/web/src/messages/en.json)/[fr.json](../../services/web/src/messages/fr.json): 1262 keys each, **0 key drift** (excellent). But 100 distinct English values repeat across 2+ namespaces: `"Cancel"` ×23, `"Save"` ×7, `"Saving…"` ×7, `"Loading…"` ×6 ; the avatar/logo upload-error block is copy-pasted across three namespaces. Every duplicate doubles fr maintenance. Fix: route generic verbs through `common.*`, add a shared `uploadErrors.*` namespace.

## Consistency

- **Two names for the same screen type:** `*-list.tsx` (organizations, users, projects, industries, deliveries) vs `*-manager.tsx` (roles, webhooks) for identical FilterBar+TableDetailLayout screens ; detail components split across `-detail`/`-editor`/`-form` with no correlating reason. Pick one convention.
- **Native `confirm()` instead of the house `ConfirmDialog`:** [role-editor.tsx](<../../services/web/src/app/(authed)/admin/rbac/role-editor.tsx>):304-314, [webhook-editor.tsx](<../../services/web/src/app/(authed)/admin/webhooks/webhook-editor.tsx>):312-317 (while the rotate-secret flow in the same file uses a proper Dialog), calendar new-event-popover.
- **Save-on-blur vs DirtyFormBar:** [admin-profile-form.tsx](<../../services/web/src/app/(authed)/admin/users/[id]/admin-profile-form.tsx>):97-128 commits per field ; its self-service twin `account/profile-section.tsx` batches through `DirtyFormBar`. Same surface, two philosophies.
- **Dead/dev code in the authed tree:** [dev/fields/page.tsx](<../../services/web/src/app/(authed)/dev/fields/page.tsx>) (214 lines, `console.log` at :167) ships with no flag gate ; unused `useTransition()` at profile-section.tsx:74.
- **`useDetailPanelRoute.close()` uses `router.push`** ([use-detail-panel-route.ts](../../services/web/src/components/patterns/use-detail-panel-route.ts):37) so Back reopens the panel ; `replace` was likely intended — one decision, six screens inherit it.
- **Server-side error handling is exemplary** — one `TRPCError` construction in the whole packages tree, everything else throws typed `AppError` subclasses translated by one middleware (70 `UnauthorizedError`, 53 `ValidationError`, 43 `NotFoundError`, 11 `ForbiddenError`, 3 `ConflictError`). Keep and imitate.
- **TODO/FIXME/HACK inventory is effectively zero** in source. Notably clean.

## Package hygiene

- **`@monark/shared` is empty** (`export {}`, imported by nobody). **`@monark/components` exports exactly one function** (`cn`), consumed only via a re-export shim. Two whole packages (package.json, tsconfig, README, turbo caching, lint targets) carrying ~10 effective lines. Three overlapping "shared code" packages (`shared`, `common`, `components`) with prose-only boundaries is a recurring wrong-package hazard. Fix: fold `cn` into services/web (or a future `@monark/ui`) and delete both until a concrete need lands.
- **`@monark/test-utils` is real and used** (testcontainer global-setup, db helpers, test-db assertion ; consumed by all 10 integration suites) but stops at infrastructure — entity fixtures (create user/org/role) are re-rolled per package's `beforeAll`. Next thing to hoist here, along with the config factory (M-D6).

## Type-safety erosion

| Escape hatch                      | Count in production src             | Notes                                                                                                                              |
| --------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `as any`                          | effectively 0                       | real ones only in webhooks worker tests                                                                                            |
| `@ts-ignore` / `@ts-expect-error` | 0 in src                            | 12 in tests, all justified                                                                                                         |
| `as unknown as`                   | 3 in src                            | typing around the Supabase admin API ; acceptable, documented                                                                      |
| Non-null `!`                      | **~70 in src**, banned by CLAUDE.md | concentrated in calendar UI: day-view (8), month-view (8), week-view (9), new-event-popover ; plus the pagination trio (M-D5)      |
| `eslint-disable`                  | 12                                  | 8 are `react-hooks/exhaustive-deps` in calendar views ; 1 real `any` (`rdpLocale: any` — react-day-picker exports a `Locale` type) |

The strict-TS rule holds everywhere **except the calendar module** — which is simultaneously the newest, largest, least-tested, and unmanifested code. Every erosion signal points at one hot spot.

## Size / complexity hot spots (top 10)

| Lines | File                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1038  | [calendar/week-view.tsx](<../../services/web/src/app/(authed)/calendar/week-view.tsx>)                                                   |
| 991   | [calendar/new-event-popover.tsx](<../../services/web/src/app/(authed)/calendar/new-event-popover.tsx>)                                   |
| 911   | [calendar/day-view.tsx](<../../services/web/src/app/(authed)/calendar/day-view.tsx>)                                                     |
| 769   | [patterns/data-table/data-table.tsx](../../services/web/src/components/patterns/data-table/data-table.tsx) (earns it — serves 7 screens) |
| 654   | calendar/month-view.tsx                                                                                                                  |
| 630   | account/totp-section.tsx                                                                                                                 |
| 630   | account/actions.ts                                                                                                                       |
| 622   | admin/webhooks/webhook-editor.tsx                                                                                                        |
| 594   | packages/auth/src/server/index.ts                                                                                                        |
| 578   | admin/rbac/role-editor.tsx                                                                                                               |

Calendar's three views (3,594 combined lines) share lane/overlap layout math, drag state machines, and per-day bucketing that could live in `packages/calendar/src/client` as tested pure modules (some already does in `day-schedule.tsx`).

## Test posture

- **Core-package integration story is strong** — auth (12 files, incl. 487-line totp + 448-line trusted-devices suites), webhooks (7), notifications (8), rbac (6), feature-flags (5), organizations/users — real testcontainer-Postgres suites. **10 Playwright e2e specs** cover the critical auth/admin flows.
- **Gaps:** `packages/calendar` has **1 test file** for a full module with a 500+-line server layer ; `packages/projects` has **1 test file** despite being the reference extended module ; `db` and `branding` are near-zero ; no e2e for projects/industries/calendar user flows.
- Fix: minimum bar = an integration suite per module with a tRPC surface. Calendar and projects are the debt.

## Docs drift

- [packages/rbac/README.md](../../packages/rbac/README.md):65-85 Public API table is stale — documents `hasRole`/`requireRole`/`primaryRole`/`rbac.myPrimaryRole` ; actual exports are `hasRoleKey`/`requireRoleKey`, `primaryRole` doesn't exist, and ~10 `admin*` procedures + `devToggleSysadmin` are undocumented. A sample of one suggests auditing all package READMEs against exports.
- CLAUDE.md claims "flags surface in `/admin/feature-flags` automatically" — there is **no `/admin/feature-flags` route** (nor `/admin/notifications`). The doc promises admin surfaces that don't exist.
- **Skeleton mandate partially unmet:** account sections profile/notifications/totp/danger have **no `isLoading` skeleton branch** (siblings email-section and trusted-devices-section do it right) ; `account/notifications/loading.tsx` hardcodes a 3×5 skeleton for a real 2×2 matrix.
- **Hardcoded string** violating the i18n rule: [trusted-devices-section.tsx](<../../services/web/src/app/(authed)/account/trusted-devices-section.tsx>):288.

## Genuinely well-factored (keep and imitate)

- **Error model:** single `AppError` hierarchy + one translation middleware ; zero scattered `TRPCError`s.
- **`components/patterns/` is real, not aspirational:** all 7 list screens use DataTable/FilterMenu/TableDetailLayout ; zero loose toolbar Selects, zero spinner/"Loading…" violations, zero multi-button rows ; `useDetailPanelRoute` is a tight 46-line URL-state hook.
- **i18n key parity is perfect** (1262/1262, zero untranslated fr) ; pattern components correctly take pre-translated labels.
- **Codegen discipline** (manifest → gen → CI check) is a good system — M-C1 is a violation of it, not a flaw in it.
- **`@monark/test-utils` testcontainer setup** shared by all 10 integration suites ; near-zero TODO debt.

## Top-priority actions

1. **Fix M-C1 now** (manifest + calendar events + `pnpm gen`) — the tree currently fails its own CI gate.
2. `authedProcedure`/`orgScopedProcedure` in `@monark/common/trpc` (M-D1) — kills ~40 preamble copies and hardens the auth surface.
3. `useFormBaseline` + `useToastMutation` (M-D2, M-D3) — ~500 lines and fixes 3 silent-failure mutations.
4. `defineIntegrationConfig` factory + entity fixtures in `@monark/test-utils` (M-D6).
5. Email partial builders (M-D7) ; `takePage` helper (M-D5, also purges 3 banned `!`s).
6. Delete/fold `@monark/shared` + `@monark/components` ; move `dirty-form-bar.tsx` into `patterns/`.
7. Add tests to `calendar`/`projects` and purge the ~70 non-null `!`s (calendar first).
