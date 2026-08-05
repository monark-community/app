# Backlog

Open follow-up items. See [README.md](README.md) for the convention. Strike items as they ship ; the CHANGELOG carries the history.

## Dependency upgrades — deferred majors

Two routine Dependabot majors were deferred on 2026-08-01 (the rest — @tanstack/react-query, all @trpc/\* unified at 11.18, @tailwindcss/postcss, react, @types/node 25, ESLint 10 + typescript-eslint 8.65, and the GitHub-Actions bumps — landed). Both are dev/runtime majors, **not security**, so there's no urgency.

- [ ] **[2026-08-01] TypeScript 5.9 → 6.0.** Bumping `typescript` to `^6.0.3` breaks Node-global type resolution (`process`/`console`/`__dirname`/`node:*` not found) in packages that don't declare `@types/node` (e.g. `@monark/branding`, `@monark/db`) — and even in ones that do (`@monark/test-utils`). TS 6 changed automatic `@types` inclusion, so the migration needs `@types/node` added to those packages **plus** a `tsconfig.base.json` change (likely an explicit `types`/`typeRoots` or `lib` tweak), then a full re-verify that may surface more TS-6 strictness errors. Note: `typescript-eslint@8.65` already supports TS 6 (peer `<6.1.0`), so the lint side is fine. Until this lands, a `pnpm.overrides` pin (`"typescript": "5.9.3"`) keeps the whole workspace on 5.9.3 — trpc/prisma list `typescript` as an _optional peer_, and pnpm's auto-install-peers otherwise pulls TS 6.0.3 and hoists it to those packages' `tsc`. Remove that override as part of the TS-6 migration.
- [ ] **[2026-08-01] otplib 12 → 13 (2FA).** otplib 13 is a full API redesign: the `authenticator` singleton is gone, replaced by an `OTP` class + a functional API (`generateSecret` / `generateURI` / `verify` / `verifySync`) with different secret-encoding defaults (base32-assumed) and a new default crypto plugin (`NobleCryptoPlugin`). [packages/auth/src/server/totp.ts](../../packages/auth/src/server/totp.ts) uses `authenticator.{generateSecret,keyuri,check}` + `authenticator.options`, all of which change. Because this is security-critical 2FA, the migration must be rewritten carefully and validated end-to-end against the auth TOTP integration tests (enrollment + verification codes must still match authenticator apps). Deferred rather than rushed.

## Prisma schema fragments

Per-package schema fragments landed for the extended modules (calendar + kanban own `packages/<module>/prisma/<module>.prisma`, assembled into the generated `schema.prisma` by `pnpm gen:schema` ; `check:tiers` rejects an extended banner in `base.prisma`). Two follow-ups deferred from that work:

- [ ] **[2026-07-28] Fragment the core modules too.** Only the two extended modules moved to fragments ; all core models still live in the single [base.prisma](../../packages/db/prisma/base.prisma). Split each core module's `// ── MODULE: <name> ──` banner into its own `packages/<module>/prisma/<module>.prisma` so every module owns its schema source symmetrically. Purely mechanical (the assembler already globs all `packages/*/prisma/*.prisma`) but touches every model, so verify no migration drift (`prisma migrate diff` clean) across the whole schema.
- [ ] **[2026-07-28] Soft-FK decouple core ↔ extended.** `base.prisma` still names the extended types via back-relations (`Organization.calendarEvents CalendarEvent[]`, `Role.kanbanBoardAccess KanbanBoardRoleAccess[]`, etc.) because Prisma requires both sides of an `@relation`. To make `base.prisma` self-contained (core compiles without any extended fragment), drop the calendar/kanban FKs to `Organization`/`Role` to plain indexed `String` ids (no `@relation`, mirroring `KanbanCard.assigneeIds`), removing the core back-relation fields. Cost: loses DB cascade + referential integrity (org/role delete must cascade in app code / a cleanup subscriber) and needs a migration dropping the FK constraints. Bigger + riskier — only worth it if we want true per-package deploy isolation.

## GitHub integration

- [ ] **[2026-08-05] Test the GitHub module against a real repo + live events.** The `@monark/github` MVP is unit + integration tested, but a real end-to-end round-trip (live webhook deliveries + real REST calls from the nodes) can't run in CI — it needs a token, a repo, and a publicly reachable API URL. Detailed manual test plan (triggers, node read/writes, signature/security, error handling, an end-to-end triage-bot scenario) in [github-integration-testing.md](github-integration-testing.md). Run before trusting it in production.

## Webhooks

- [ ] **[2026-05-08] Default env-var secret resolver.** Ship a `WEBHOOK_SECRETS` JSON env-var backed resolver as the default so single-tenant deploys work without integrating an external secret store. See [webhook-secret-resolver.md](../technical-documentation/webhook-secret-resolver.md) for the contract.
- [ ] **[2026-05-08] Per-endpoint rate limiting.** A receiver returning 429 today retries with backoff but doesn't pause sibling deliveries to the same endpoint. A token bucket per endpoint would be kinder.
- [ ] **[2026-05-08] Delivery log export.** No CSV or JSON download of delivery history from the admin UI. Operators who need bulk audit data rely on the database directly.

## RBAC custom roles ; ~~design locked, ready to implement~~ shipped 2026-05-04

Shipped. See the CHANGELOG entry dated 2026-05-04. Out-of-scope items below remain open.

- [ ] **Cross-org role templates** ("copy these permissions from Org A's Reviewer to Org B"). Operators can recreate manually for now.
- [ ] **Permission-level audit** ("who has permission X?"). Useful but separate feature.
- [ ] **Per-request `cache()` wrapping of `hasPermission` / `hasRoleKey`.** The new schema does a join to `Role` on every check ; once a render path exists that runs N permission checks, wrap them.

## Admin user management

- [ ] **[2026-05-04] Admin-initiated email change.** Slice 4 of the admin view shipped password-reset link initiation but skipped email-change. Two viable patterns and we punted on picking ; (a) Supabase admin API direct mutation (`auth.admin.updateUserById(targetId, { email })`) — easy, but skips user confirmation entirely so a compromised admin account can pivot any user's recovery email silently ; (b) custom pending-admin-email-change tokens stored in the DB, with a confirmation link sent to the user's _current_ address requiring them to approve the change before it lands — safer but new infra (table, expiry, two-side flow). Pick before shipping. The user said "initiate" in chat so default to (b) when revisiting.

## Security headers

- [ ] **[2026-05-03] Add `Strict-Transport-Security` + a basic CSP in `services/web/src/middleware.ts`, gated to `NODE_ENV === "production"`.** HSTS is one line ; CSP needs a once-over of script / style / img / connect sources (Next inlines, Supabase, Google Fonts for Nunito Sans, the brand logo asset). Skipped during the LAN-from-phone work because dev's mixed-content + LAN flows would need the policy relaxed and the gate avoided regressions ; production should still ship the headers.

- [ ] **[2026-05-03] Tighten the trusted-device cookie to `SameSite="strict"` in production.** Currently `"lax"` everywhere, which is required in dev for the cross-port LAN testing flow. In production the cookie is only ever read by our own domain's server actions, so `strict` is fine and closes a class of CSRF surface. Gate behind `NODE_ENV === "production"` in [`lib/trusted-device-cookie.ts`](../../services/web/src/lib/trusted-device-cookie.ts) `cookieStore.set` options.

## Security audit follow-ups

Deferred from the 2026-07-29 full-branch security audit (the High/Medium/Low fixes that shipped are in the CHANGELOG dated 2026-07-29). Ordered roughly by severity.

- [ ] **[2026-07-29] `FileBucket` org-scoping (Medium).** `FileBucket` ([base.prisma](../../packages/db/prisma/base.prisma)) has no `organizationId` and `name` is globally unique, so buckets are a single cross-tenant namespace: any `files.view` holder enumerates every org's bucket names + policies, any `files.upload` holder can upload into another org's bucket (objects stay key-isolated but land under a foreign — possibly public — bucket), and names can be squatted (cross-tenant `ConflictError` DoS). File _data_ isolation itself is intact (keys are org-prefixed; every by-id path is org-checked). Fix: add `organizationId` to `FileBucket`, scope `listBuckets`/`findBucketByName`/`createUpload`/`downloadUrl` by org, make `(organizationId, name)` the uniqueness key — keep the shared system-owned `data-model-files` bucket as a deliberate exception. Needs a schema migration; interacts with Supabase's global bucket naming. Mostly moot in the default single-tenant mode. ([files/server/data.ts](../../packages/files/src/server/data.ts), [index.ts](../../packages/files/src/server/index.ts)).
- [x] ~~**[2026-07-29] Public-bucket creation should be a platform-tier capability.**~~ shipped 2026-07-29 — `buckets.create` now requires SYSADMIN (`hasSysadminAssignment`) to set `isPublic: true`; an org-tier `files.manage-buckets` holder can only create private buckets ([files/server/index.ts](../../packages/files/src/server/index.ts)). Documenting "public buckets must never hold user-uploaded content" remains as an ops note.
- [ ] **[2026-07-29] HTTP-trigger replay + rate limiting; check the secret before parsing the graph.** `handleHttpTrigger` ([http-trigger.ts](../../packages/automation/src/server/http-trigger.ts)) runs `parseGraph` _before_ the constant-time secret compare (an unauthenticated caller who knows an automation id forces a graph parse per request) and has no rate limiting or nonce/timestamp/idempotency key (a captured valid request replays to re-enqueue runs). Compare the secret first; add per-automation rate limiting on `/hooks/automation/:id`; optionally accept an idempotency key. Pairs with the generic tRPC/API rate-limit primitive noted under Trusted devices.
- [ ] **[2026-07-29] SSRF residual: DNS-rebind TOCTOU pinning.** The 2026-07-29 fixes reject literal-private-IP `https://`, fail closed on `NODE_ENV`, set `redirect: "manual"`, resolve+reject private-resolving hosts in production, and added an opt-in `safeFetch({ maxBytes })` response cap (~shipped). The remaining residual in [@monark/common/http](../../packages/common/src/http.ts) is a small TOCTOU between the resolution guard and `fetch`'s own resolution (a rebind in that window) — fully closing it needs a pinned undici dispatcher whose `lookup` re-validates the connected IP.
- [x] ~~**[2026-07-29] Formula / transform expression length + recursion-depth cap (Low, DoS).**~~ shipped 2026-07-29 — [formula.ts](../../packages/data-models/src/contracts/formula.ts) caps input at 10k chars + parser recursion at depth 64 (throws `FormulaError`), and `FUNCTIONS` lookups use `Object.hasOwn` so inherited Object props parse as "unknown function"; the `transform` node caps its expression at 2000 chars ([transform.ts](../../packages/automation/src/server/nodes/transform.ts)). Covered by 3 new formula unit tests.
- [ ] **[2026-07-29] PENDING `StoredFile` sweep.** `createUpload` mints a signed URL + PENDING row per call with no TTL/cleanup, so abandoned uploads accumulate orphan rows. Add a daily sweep for stale PENDING rows (mirror the trusted-device / deletion sweep pattern). NOTE: the policy-less-bucket size gap is now closed — `finalize` enforces the real object size against `bucket.fileSizeLimit ?? MAX_FILE_SIZE` (shipped 2026-07-29), so an unbounded bucket is still capped at the hard ceiling. (A stored per-bucket default couldn't use the 5 GiB ceiling because `FileBucket.fileSizeLimit` is INT4 (~2.14 GB max) — a separate cleanup would migrate that column to BigInt and tighten the `buckets.create` input `.max()`, which currently accepts values that overflow the column.)
- [ ] **[2026-07-29] Decide whether `automation.secrets.list` should gate on `secrets.read`.** It returns secret _names_ (never values) under `automation.view` ([router.ts](../../packages/automation/src/server/router.ts)) — a deliberate widening so an automation author can pick a secret to wire without holding `secrets.read`. Names (e.g. `STRIPE_SECRET_KEY`) leak the org's integration surface to an automation-viewer. Acceptable as-is; if names are considered sensitive in a given deployment, gate on `secrets.read` too.
- [ ] **[2026-07-29] Structurally enforce "a secret value never leaves a node as output."** Today `ctx.getSecret` returning plaintext into an automation node's output is prevented only by a convention comment ([registry.ts](../../packages/automation/src/server/registry.ts)). If a future node returns a secret in its output, the webhook node's field-links would let an author exfiltrate it to any `https://` host. A tainted/redacted wrapper for secret values (that the run-step serializer scrubs) would enforce it rather than relying on node-author discipline.

## UA Client Hints

- [ ] **[2026-05-03] Move `Accept-CH` + `Permissions-Policy: ch-ua-*` out of middleware in production builds.** Currently sent on every request regardless of environment ; in production Vercel / Cloudflare can serve the headers from the edge config, which keeps middleware focused on auth + redirects. Not urgent — the in-middleware version works correctly.

## Email assets

- [ ] **[2026-05-02] Ship a 80×80 PNG logo alongside the SVG.** Outlook desktop and parts of Gmail render SVG inconsistently in HTML emails ; the email shell currently uses `${appUrl}${logoSrc}` which points at the SVG. Drop a PNG into `services/web/public/` and either branch the email shell on the source extension or add a `BRANDING.logoEmailUrl` field that defaults to the PNG. Already flagged in [packages/branding/README.md](../../packages/branding/README.md) under the white-label retargeting checklist.

## Trusted devices

- [ ] **[2026-05-29] Step-up auth on sensitive actions for the first 24h of a new device.** Today the new-device email is informational (with a one-click revoke link, see CHANGELOG 2026-05-29). For password-only users (no TOTP), an attacker who has the password is already in a live session before the user reads the email. Mitigation : require password re-entry (or TOTP re-challenge) before changing email / password / TOTP / delete-account when the current TrustedDevice's `firstSeenAt < now - 24h`. Surface a "Secure your account" banner on the new-device's first login if password-only. Touch points : `(authed)/account/{email,password,security,danger}` server actions gain a `freshAuthRequired` check ; new `auth.confirmPassword` mutation for the re-entry modal.

- [ ] **[2026-05-29] Out-of-band approval flow ("approve this device from an existing trusted device").** Banks do this : a new device sign-in is _gated_ until an existing device clicks "approve" in-app. High friction ; only justified when the threat model warrants (handling financial / health data, or when an account compromise is catastrophic). Defer until a customer with this requirement appears.

- [ ] **[2026-05-29] Rate-limit `/auth/revoke-device/<token>` mutation.** Each token is single-target + idempotent + 7-day-bounded, so abuse is bounded ; but a hostile crawler with a huge token list could still burn CPU on HMAC verifies. Add a per-IP token bucket once the API service grows a generic rate-limit middleware. Same backstop applies to `tRPC mutations` in general — file when that primitive lands.

- [ ] **[2026-05-29] Sweep cron for expired / long-revoked TrustedDevice rows.** The new `expiresAt` column gives us a clean cutoff but nothing prunes the table — rows live until the user is hard-deleted (CASCADE). Land a cron that runs daily (mirror the deletion / webhook sweep pattern in [services/api/src/server.ts](../../services/api/src/server.ts) `startBackgroundWork` + Render Blueprint cron entry in [render.yaml](../../render.yaml)) and `DELETE FROM "TrustedDevice" WHERE "expiresAt" < now() OR ("revokedAt" IS NOT NULL AND "revokedAt" < now() - INTERVAL '90 days')`. The 90-day retention on revoked rows keeps "your iPad was used yesterday, you revoked it today" in the audit window without unbounded growth. Pair with a `TrustedDevicesSwept` event so the metric is visible without scraping logs.

- [ ] **[2026-05-29] Surface `expiresAt` in `/account/security`.** The trusted-devices list shows "first seen" + "last seen" but nothing about _when this device will stop bypassing TOTP_. A small "Trust expires Mar 14" affordance on each card lets the user understand the rotation cadence (sliding 400-day window — refreshed on every recognized sign-in) and remove a device before it silently expires. Pull `expiresAt` through `listTrustedDevices` → `toView` → the card render.

## Notifications dispatch

- [ ] **Backfill `country` on existing `TrustedDevice` rows once a GeoIP source is wired.** The schema has the column ; nothing populates it for self-hosted-no-proxy deployments. Either wire `BRANDING.geoIpProvider` or rely on the hosting platform's edge headers (already covered for Vercel / Cloudflare / CloudFront in [`recognizeDeviceAfterAuth`](../../services/web/src/lib/trusted-device-cookie.ts)).

- [x] ~~**[2026-05-05] Snapshot test for the email shell render.**~~ shipped 2026-05-05 ; [packages/notifications/tests/email-shell.test.ts](../../packages/notifications/tests/email-shell.test.ts) iterates every registered `NotificationKind` × `en|fr` and asserts the rendered HTML / subject / text contain no literal `{{` `}}` substrings, plus that the brand wordmark + logo URL substitute correctly. 32 assertions, runs in 6 ms.

- [ ] **[2026-05-05] Email-CTA wording sweep across security templates.** Each kind has its own CTA copy + footer treatment (new-device uses muted-trailing-paragraph, password-changed uses inline numbered steps, totp-disabled now matches new-device's pattern). Worth a once-over before phase-2 ships more kinds so the family stays uniform — pick a canonical structure (probably new-device's) and align the others.

## Multi-tenant readiness

- [ ] **[2026-05-05] No write path persists `active_organization_id` on the Supabase session.** Single-tenant works because [`getCurrentOrg`](../../packages/organizations/src/server/read.ts) falls back to the singleton when the claim is null. Multi-tenant deploys won't ; the user signs in, the metadata stays empty, and `organizations.current` keeps returning null until something writes the claim. Phase-2 needs : (a) a `setActiveOrg` tRPC mutation that calls `supabase.auth.admin.updateUserById(userId, { user_metadata: { active_organization_id } })` ; (b) a sign-in side-effect (in [`signInAction`](<../../services/web/src/app/(anon)/signin/actions.ts>) or the auth `notifySignedIn` subscriber) that pins the claim to the user's first membership when missing ; (c) an org-switcher UI that calls (a). Track in this backlog item until the multi-tenant flag is actually flipped on for someone.

## Test isolation

- [x] ~~**[2026-05-29] Integration tests can leak rows into the dev DB.**~~ shipped 2026-05-29. Found `ff-org-a`, `ff-org-b`, `test-org-webhooks` orphans in the dev `Organization` table — left over from `[is-enabled.test.ts](../../packages/feature-flags/tests/integration/is-enabled.test.ts)` and `[data.test.ts](../../packages/webhooks/tests/integration/data.test.ts)`. Root cause : both suites `db.organization.upsert` in `beforeAll` with no matching `afterAll` cleanup ; if anything bypasses the integration config's `globalSetup` (IDE extension picking the unit config, manual `vitest run` without `--config`), the inserts hit whatever `DATABASE_URL` is in the env. Two-layer fix landed : (a) new `setupFiles: ["@monark/test-utils/assert-test-db"]` entry on every `vitest.integration.config.ts` aborts the run if `DATABASE_URL` doesn't contain the testcontainer marker `/monark_test` ; (b) `afterAll` org cleanup in both suites so the testcontainer exits clean even when the assertion is bypassed.

## Test coverage rollout

Driven by [test-plan.md](../technical-documentation/test-plan.md). Items below are land-time gates for phase-2 work.

- [x] ~~**[2026-05-05] Wire vitest coverage thresholds in every package + service.**~~ shipped 2026-05-05 ; per-package `vitest.config.ts` files extend the shared root [vitest.shared.ts](../../vitest.shared.ts), `@vitest/coverage-v8` is wired across the workspace, and `pnpm test:coverage` runs end-to-end. Thresholds are commented out for the moment — flip them on per package as gaps below close.
- [ ] **[2026-05-05] Backfill missing-tests gaps to clear the 75 % bar** : `@monark/users`, `@monark/organizations`, `@monark/rbac` integration suites against a Postgres testcontainer. `@monark/common` (errors / events / logger). `services/api` server + cron + bootstrap.
- [ ] **[2026-05-05] Server-action test suites** for every `services/web/src/app/.../actions.ts` file (security-sensitive surface, 80 % bar). Covers happy path + every documented error code, with stubbed `@monark/*/server` calls + Supabase admin client.
- [ ] **[2026-05-05] Component tests for the interactive islands** ; the breadcrumb walker, the notifications drawer, the role editor's tri-state checkboxes, the email-change modal's two-stage dance. List in [test-plan.md § Per-service plan](../technical-documentation/test-plan.md#servicesweb).
- [ ] **[2026-05-05] e2e spec backfill** ; the existing two specs (`auth-routing`, `signup-happy-path`) cover smoke. Add the eight in [test-plan.md § End-to-end plan](../technical-documentation/test-plan.md#end-to-end-plan) to cover signup-confirm, signin-totp, forgot-password, email-change, password-change, totp-lifecycle, account-deletion, admin-bootstrap + admin-invite + admin-rbac. Cross-browser (Chromium / Firefox / WebKit) at the same pass.
- [x] ~~**[2026-05-05] CI workflow split into `verify` + `e2e` jobs**~~ shipped 2026-05-05 ; [.github/workflows/ci.yml](../../.github/workflows/ci.yml) now has the two-job split. `verify` runs lint + typecheck + `pnpm test:coverage` ; `e2e` boots the Supabase local stack + Playwright across Chromium / Firefox / WebKit and depends on `verify` passing.
- [x] ~~**[2026-05-05] Codecov upload step.**~~ shipped 2026-05-05 ; the `verify` job hands every package's `coverage/lcov.info` to `codecov/codecov-action@v4`. Token reads from `secrets.CODECOV_TOKEN` ; `fail_ci_if_error: false` so a missing token (forks) doesn't block the build.

## Phase-1 closure

- [x] ~~**[2026-05-05] Account-deletion cron has no scheduler wired.**~~ resolved via [render.yaml](../../render.yaml) — the `monark-cron-deletions` Cron Job service posts to `/cron/process-account-deletions` daily (`0 3 * * *`) with the shared `CRON_SECRET`.

- [ ] **[2026-05-05] Single-tenant redirect chain on `/admin`.** `/admin` → `/admin/organizations` → singleton edit page is three round-trips on a cold hop. Acceptable in dev ; worth a single-tenant fast path that lands `/admin` straight on `/admin/organizations/<singletonId>` when bootstrap status is single + count=1. Same pattern the AdminSidebar tab uses. Saves ~200ms on cold loads.

## White-label gaps

- [ ] **CODE_OF_CONDUCT.md + SECURITY.md still mention `hr@monark.io` / `security@monark.io`.** Replace with placeholders that read from `BRANDING.supportEmail` (or document them as "edit when retargeting") next time those files come up.

- [ ] **shadcn registry URL `ui.monark.io` in `services/web/components.json`.** Should read from an env var so a downstream team can point at their own registry mirror.

- [ ] **Test fixtures hardcode `monark.app` + `noreply@monark.io`.** [packages/notifications/tests/enrich.test.ts](../../packages/notifications/tests/enrich.test.ts) + [email.test.ts](../../packages/notifications/tests/email.test.ts). Should derive from `BRANDING` constants so a downstream team's test suite stays meaningful after retargeting.
