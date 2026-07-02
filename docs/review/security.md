# Security review

Date: 2026-07-01 ; scope: working tree (uncommitted changes included) ; method: full audit of all 9 tRPC routers, auth token/session/TOTP/trusted-device/email-token handling, webhook signing + SSRF surface, env/secret config, input validation, web XSS/CSP/redirect/middleware, and notification templates.

Highest priorities, in order: **C1** (unauthenticated flag override — a remote security-control bypass), **H1** (MFA bypass at the API layer), **H2/H3** (calendar cross-tenant IDOR), **H4** (cross-tenant admin privilege model).

## Critical

### C1. Feature-flag override mutations have no authentication or authorization

- **File:** [packages/feature-flags/src/server/index.ts](../../packages/feature-flags/src/server/index.ts):47-63 (reads `get`/`getMany`/`listOverrides` L29-45 are also open)
- **Evidence:**

```ts
setOverride: publicProcedure
  .input(z.object({ key: flagKeySchema, scope: scopeSchema, enabled: z.boolean(), actorId: z.string(), note: z.string().optional() }))
  .mutation(({ input }) => setOverride(input.key, input.scope, input.enabled, input.actorId, input.note)),
removeOverride: publicProcedure
  .input(z.object({ id: z.string(), actorId: z.string() }))
  .mutation(({ input }) => removeOverride(input.id, input.actorId)),
```

- **Impact:** `publicProcedure` with no `ctx.userId` check and no `requirePermission`. Any unauthenticated caller who can reach `/trpc` can create or delete global/org/role/user flag overrides. The actor identity comes from `input.actorId`, so the audit trail is attacker-forgeable. Security-relevant flags are toggleable this way: `auth.totp-required-admin` (disable admin MFA enforcement platform-wide), `auth.trusted-devices`, `tenancy.multi-tenant`, `auth.totp-trust-devices`. This is a direct, remote, unauthenticated security-control bypass.
- **Fix:** Gate all mutating flag procedures behind `requirePermission(ctx, "feature-flags.write", scope.organizationId)` (a permission is already registered via `registerFeatureFlagsPermissions`). Derive `actorId` from `ctx.userId`, never from input. Gate `listOverrides`/`listDefinitions` behind a read permission too.

## High

### H1. TOTP is enforced only by a client cookie + web middleware ; the API accepts the bearer token regardless

- **Files:** [services/web/src/app/(anon)/signin/actions.ts](../../services/web/src/app/(anon)/signin/actions.ts):40-55, [services/web/src/middleware.ts](../../services/web/src/middleware.ts):64-77, [services/api/src/trpc/context.ts](../../services/api/src/trpc/context.ts):13-28, [services/api/src/lib/supabase.ts](../../services/api/src/lib/supabase.ts):25-40
- **Evidence:** After `signInWithPassword`, `data.session.access_token` is already fully valid (the signin action's own comment: "the session cookie is live but the middleware pending-gate keeps the user from reaching protected routes"). The only gate is the `monark_totp_pending` cookie checked in web middleware. The API context authorizes purely on `supabase.auth.getUser(token)` ; it never checks whether a TOTP challenge was satisfied.
- **Impact:** An attacker who has the victim's password obtains a valid access token from the password step and can (a) call the tRPC API directly with the bearer token, or (b) delete the client-controlled `monark_totp_pending` cookie — fully bypassing the second factor for all API access. TOTP provides no real protection at the authorization layer.
- **Fix:** Enforce MFA at the token/session layer — use Supabase MFA assurance levels and require AAL2 in `verifyAccessToken`/`requirePermission` for TOTP-enrolled users, or issue a restricted session until TOTP passes. A server-side check, not a client cookie, must gate privileged procedures.

### H2. Calendar `events.delete` — cross-tenant IDOR, no permission check

- **File:** [packages/calendar/src/server/index.ts](../../packages/calendar/src/server/index.ts):286-295 ; data layer [data.ts](../../packages/calendar/src/server/data.ts):277-282 (`where: { id }`, no org filter)
- **Evidence:**

```ts
delete: publicProcedure.input(z.object({ id: z.string().min(1) }))
  .mutation(async ({ ctx, input }) => {
    if (!ctx.userId) throw new UnauthorizedError()
    await requireOrg({ userId: ctx.userId, activeOrganizationId: ctx.activeOrganizationId })
    await softDeleteCalendarEvent(input.id)   // no org / calendar-access / permission check
  }),
```

- **Impact:** Any authenticated user in any org can soft-delete any calendar event platform-wide by id. No `requirePermission`, no calendar-accessibility check, no org match.
- **Fix:** Load the event, verify `event.organizationId === org.id` and that its calendar is in `resolveAccessibleCalendarIds`, and gate on `calendar.manage`.

### H3. Calendar `events.update` — cross-tenant IDOR, allows moving events into arbitrary calendars

- **File:** [packages/calendar/src/server/index.ts](../../packages/calendar/src/server/index.ts):248-284 ; data layer [data.ts](../../packages/calendar/src/server/data.ts):211-257 (`update where: { id }`, no org filter)
- **Evidence:** The handler resolves `org` but never verifies the target event belongs to the org or an accessible calendar before `updateCalendarEvent(input.id, {...})` ; the optional `input.calendarId` lets the event be reassigned to any calendar id with no accessibility check.
- **Impact:** Any authenticated user can edit or relocate any calendar event platform-wide by id. Compare with `events.create` (L222-225), which correctly checks `calendarIds.includes(input.calendarId)`.
- **Fix:** Fetch the existing event, verify org + calendar accessibility for both the source and the new `calendarId`, and require the write permission.

### H4. Global "is an admin somewhere" gate used for cross-tenant admin actions on arbitrary org/user ids

- **Files:** [packages/rbac/src/server/data.ts](../../packages/rbac/src/server/data.ts):208-231 (`hasAnyAdminAssignment` matches ADMIN in *any* org), consumed by:
  - [packages/rbac/src/server/index.ts](../../packages/rbac/src/server/index.ts):39-44 `requireAdmin` → `adminAssignRole` (L145-175, arbitrary `organizationId`/`roleId`), `adminCreateRole`/`adminUpdateRole`/`adminDeleteRole`/`adminListRoles`
  - [packages/users/src/server/index.ts](../../packages/users/src/server/index.ts):49-54 `requireAdmin` → `adminListUsers`, `adminGetUser`, `adminUpdateProfile`, `adminRequestDeletion`, `adminCancelDeletion` (all platform-wide by userId)
  - [packages/organizations/src/server/index.ts](../../packages/organizations/src/server/index.ts):40-45 → `adminList`, `adminUpdate`/`adminGet` (any org id), `invites.adminCreate` (invite into any org with any role)
  - [packages/auth/src/server/index.ts](../../packages/auth/src/server/index.ts):508-520 `adminHardDeleteUser` (any userId)
  - [packages/notifications/src/server/router.ts](../../packages/notifications/src/server/router.ts):27-32 admin prefs on any userId
- **Evidence:** `requireAdmin` only asserts `summary.hasAdmin` (true for an ADMIN of *any single* org), then acts on the caller-supplied `organizationId`/`userId` with no check that the caller administers that specific target.
- **Impact:** In multi-tenant mode (`tenancy.multi-tenant`, supported by the codebase) an org-tier ADMIN of Org A can enumerate, read, modify, and delete users and organizations across all tenants, invite into other orgs, assign roles in other orgs, and hard-delete arbitrary users — a systemic tenant-isolation and privilege-escalation break. Even single-tenant, it conflates org-admin with platform-admin.
- **Fix:** For org-scoped procedures, gate on `requirePermission(ctx, "<module>.<key>", input.organizationId)` (org-scoped `hasPermission`) instead of a global admin flag ; for platform-wide surfaces require `hasSysadminAssignment`. For `adminAssignRole`, verify the actor administers `input.organizationId` and cannot grant roles outside it.

## Medium

### M1. Webhook delivery SSRF — production accepts HTTPS to internal/loopback/metadata hosts

- **Files:** [packages/webhooks/src/server/router.ts](../../packages/webhooks/src/server/router.ts):68-92 (`assertSafeUrl`), delivery [worker.ts](../../packages/webhooks/src/server/worker.ts):122-127
- **Evidence:** `if (parsed.protocol === "https:") return` — HTTPS URLs are accepted unconditionally in production ; only `http://` is restricted to private hosts in dev. No allow/deny-list on the resolved IP, and the worker fetches `delivery.endpoint.url` with no egress filtering.
- **Impact:** An operator with `webhooks.write` can register `https://169.254.169.254/…` (cloud metadata), `https://10.x`, `https://127.0.0.1`, or an internal service and observe response behavior via delivery attempts — SSRF into the internal network. Also vulnerable to DNS rebinding, since the host is only string-checked at create time, never at connect time.
- **Fix:** Resolve the hostname and reject RFC1918/loopback/link-local/ULA/metadata ranges for all schemes in production ; re-validate the resolved IP at delivery time (or pin to the validated IP) ; consider an egress proxy/allowlist.

### M2. Email templates interpolate user-controlled values without HTML escaping

- **Files:** [packages/notifications/src/server/template.ts](../../packages/notifications/src/server/template.ts):36-44 (`interpolateVars` — raw substitution), [enrich.ts](../../packages/notifications/src/server/enrich.ts):210-221 (values stringified, not escaped), [_partials/email-shell.ts](../../packages/notifications/src/templates/_partials/email-shell.ts)
- **Evidence:** `interpolateVars` does `input.replace(VAR_RE, name => vars[name] ?? "")` — no entity encoding. `enrichVars` puts raw strings (calendar `eventTitle`, `previousEmail`/`newEmail`, device fields) straight into `TemplateVars`.
- **Impact:** Stored HTML injection into outbound emails. A calendar event title (up to 200 chars of arbitrary content) is rendered into the `calendar.event.reminder` HTML email sent to other org members, enabling markup/link injection and phishing content in a trusted-looking email.
- **Fix:** HTML-escape all interpolated variables by default in `interpolateVars`, with an explicit opt-out only for template-author-controlled fragments like `logoHtml`.

### M3. `EMAIL_ACTION_SECRET` silently falls back to a hardcoded dev default

- **Files:** [packages/auth/src/server/email-action-token.ts](../../packages/auth/src/server/email-action-token.ts):30-46 ; env schema marks it optional in [services/api/src/lib/env.ts](../../services/api/src/lib/env.ts):30
- **Evidence:** `resolveSecret` returns a hardcoded `DEV_SECRET` (with a one-time `logger.warn`) when the env var is unset.
- **Impact:** If a production deploy forgets the secret, the HMAC key for one-click "revoke this device" email tokens is a public constant — an attacker can forge valid revoke tokens for any `(userId, deviceId)`. Fails open rather than closed.
- **Fix:** Hard-fail at boot in production when `EMAIL_ACTION_SECRET` is unset — the same pattern `CRON_SECRET` already uses.

### M4. TOTP brute-force controls are weak and incomplete

- **Files:** [packages/auth/src/server/totp-rate-limit.ts](../../packages/auth/src/server/totp-rate-limit.ts):10-29 (in-memory per-process Map), [totp.ts](../../packages/auth/src/server/totp.ts):164-179 (`verifyTotpCode` rate-limited) vs 183-214 (`verifyRecoveryCode` — no limit)
- **Impact:** (a) The 5/min TOTP cap is per process — with N API replicas the effective ceiling is 5N/min, and it resets on every deploy ; no account lockout. (b) `verifyRecoveryCode` has no rate limit at all (codes are 48-bit bcrypt-hashed, so brute force is impractical, but the missing control adds bcrypt CPU-DoS surface).
- **Fix:** Move rate limiting to a shared store (DB/Redis) keyed per user ; apply the same cap to `verifyRecoveryCode` ; add exponential backoff.

## Low / Info

- **L1.** CRON secret compared non-constant-time — [services/api/src/lib/cron-auth.ts](../../services/api/src/lib/cron-auth.ts):18 uses `!==`. Prefer `crypto.timingSafeEqual`. Low (network timing is noisy).
- **L2.** CSP allows `script-src 'unsafe-inline'` — [services/web/next.config.ts](../../services/web/next.config.ts):51, acknowledged in comments. Move to nonces/hashes. Low.
- **L3.** User enumeration on signup — [packages/auth/src/server/signup.ts](../../packages/auth/src/server/signup.ts):86-88 throws "An account with that email already exists." (contrast the enumeration-safe forgot-password flow). Low.
- **L4.** CORS allows requests with no `Origin` header — [services/api/src/server.ts](../../services/api/src/server.ts):285. Standard for server-to-server ; auth still required. Info.
- **L5.** `feature-flags.get/getMany` accept arbitrary `userId`/`organizationId` scope unauthenticated, leaking flag state. Info (subsumed by C1's fix).
- **L6.** `rbac.devToggleSysadmin` ([rbac/src/server/index.ts](../../packages/rbac/src/server/index.ts):112-141) self-grants SYSADMIN, gated only by `NODE_ENV !== "production"`. Ensure `NODE_ENV` is reliably `production` in all prod and preview deploys. Info.
- **L7.** tRPC `onError` logging deliberately excludes input contents (`hasInput` boolean only) — good ; verify Prisma error messages don't carry row data into logs. Info.

## Done well

- **Secrets at rest:** TOTP secrets AES-256-GCM encrypted with a 32-byte env key ([crypto.ts](../../packages/auth/src/server/crypto.ts)) ; recovery codes bcrypt-hashed ; webhook signing secrets stored only as SHA-256 hashes with plaintext returned once ([webhooks/src/server/secrets.ts](../../packages/webhooks/src/server/secrets.ts):16-20) ; trusted-device cookies stored as SHA-256 hashes of opaque 32-byte random values ([trusted-devices.ts](../../packages/auth/src/server/trusted-devices.ts):53-59).
- **Constant-time comparisons** for email-action tokens and hex digests ([email-action-token.ts](../../packages/auth/src/server/email-action-token.ts):141, [crypto.ts](../../packages/auth/src/server/crypto.ts):56-61).
- **Webhook signing:** HMAC-SHA256 over `timestamp.body` with replay-window timestamps, per-delivery idempotency keys, bounded retries with backoff and auto-disable.
- **Enumeration-safe flows:** password reset and confirmation resend both return uniform success.
- **Projects module is the reference pattern:** every read/write resolves `requireOrg`, checks `requirePermission(..., org.id)`, and verifies `existing.organizationId === org.id` ([projects/src/server/index.ts](../../packages/projects/src/server/index.ts)) — exactly what the calendar and admin routers should copy.
- **No SQL injection found:** the one raw query is a parameterized Prisma tagged template with a clamped numeric ; inputs are zod-validated at boundaries ; env validated with zod.
- **Logging hygiene:** query strings stripped, bodies/headers omitted, pino redaction of cookies/authorization/tokens ([http-logger.ts](../../services/api/src/lib/http-logger.ts)).
- **Security headers:** production CSP, HSTS (2y, preload), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, referrer-policy, Permissions-Policy lockdown ([next.config.ts](../../services/web/next.config.ts)).
- **RBAC design:** SYSADMIN cannot be granted or revoked via the admin UI ; admins can't hard-delete themselves.

## Remediation order

1. C1 — gate the feature-flags router (hours ; do first, it is remotely exploitable unauthenticated).
2. H2/H3 — org-scope + permission-check calendar event mutations (hours ; copy the projects pattern).
3. H4 — replace `requireAdmin`-anywhere with org-scoped `requirePermission` / `hasSysadminAssignment` across the five admin surfaces (a day ; this is the tenancy model's load-bearing wall).
4. H1 — move MFA enforcement to the token layer (design work ; Supabase AAL).
5. M1-M4 in order ; then the Lows opportunistically.
