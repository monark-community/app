# Backlog

Open follow-up items. See [README.md](README.md) for the convention. Strike items as they ship ; the CHANGELOG carries the history.

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

- [ ] **[2026-05-04] Admin-initiated email change.** Slice 4 of the admin view shipped password-reset link initiation but skipped email-change. Two viable patterns and we punted on picking ; (a) Supabase admin API direct mutation (`auth.admin.updateUserById(targetId, { email })`) — easy, but skips user confirmation entirely so a compromised admin account can pivot any user's recovery email silently ; (b) custom pending-admin-email-change tokens stored in the DB, with a confirmation link sent to the user's *current* address requiring them to approve the change before it lands — safer but new infra (table, expiry, two-side flow). Pick before shipping. The user said "initiate" in chat so default to (b) when revisiting.

## Security headers

- [ ] **[2026-05-03] Add `Strict-Transport-Security` + a basic CSP in `services/web/src/middleware.ts`, gated to `NODE_ENV === "production"`.** HSTS is one line ; CSP needs a once-over of script / style / img / connect sources (Next inlines, Supabase, Google Fonts for Nunito Sans, the brand logo asset). Skipped during the LAN-from-phone work because dev's mixed-content + LAN flows would need the policy relaxed and the gate avoided regressions ; production should still ship the headers.

- [ ] **[2026-05-03] Tighten the trusted-device cookie to `SameSite="strict"` in production.** Currently `"lax"` everywhere, which is required in dev for the cross-port LAN testing flow. In production the cookie is only ever read by our own domain's server actions, so `strict` is fine and closes a class of CSRF surface. Gate behind `NODE_ENV === "production"` in [`lib/trusted-device-cookie.ts`](../../services/web/src/lib/trusted-device-cookie.ts) `cookieStore.set` options.

## UA Client Hints

- [ ] **[2026-05-03] Move `Accept-CH` + `Permissions-Policy: ch-ua-*` out of middleware in production builds.** Currently sent on every request regardless of environment ; in production Vercel / Cloudflare can serve the headers from the edge config, which keeps middleware focused on auth + redirects. Not urgent — the in-middleware version works correctly.

## Email assets

- [ ] **[2026-05-02] Ship a 80×80 PNG logo alongside the SVG.** Outlook desktop and parts of Gmail render SVG inconsistently in HTML emails ; the email shell currently uses `${appUrl}${logoSrc}` which points at the SVG. Drop a PNG into `services/web/public/` and either branch the email shell on the source extension or add a `BRANDING.logoEmailUrl` field that defaults to the PNG. Already flagged in [packages/branding/README.md](../../packages/branding/README.md) under the white-label retargeting checklist.

## Notifications dispatch

- [ ] **Backfill `country` on existing `TrustedDevice` rows once a GeoIP source is wired.** The schema has the column ; nothing populates it for self-hosted-no-proxy deployments. Either wire `BRANDING.geoIpProvider` or rely on the hosting platform's edge headers (already covered for Vercel / Cloudflare / CloudFront in [`recognizeDeviceAfterAuth`](../../services/web/src/lib/trusted-device-cookie.ts)).

- [x] ~~**[2026-05-05] Snapshot test for the email shell render.**~~ shipped 2026-05-05 ; [packages/notifications/tests/email-shell.test.ts](../../packages/notifications/tests/email-shell.test.ts) iterates every registered `NotificationKind` × `en|fr` and asserts the rendered HTML / subject / text contain no literal `{{` `}}` substrings, plus that the brand wordmark + logo URL substitute correctly. 32 assertions, runs in 6 ms.

- [ ] **[2026-05-05] Email-CTA wording sweep across security templates.** Each kind has its own CTA copy + footer treatment (new-device uses muted-trailing-paragraph, password-changed uses inline numbered steps, totp-disabled now matches new-device's pattern). Worth a once-over before phase-2 ships more kinds so the family stays uniform — pick a canonical structure (probably new-device's) and align the others.

## Multi-tenant readiness

- [ ] **[2026-05-05] No write path persists `active_organization_id` on the Supabase session.** Single-tenant works because [`getCurrentOrg`](../../packages/organizations/src/server/read.ts) falls back to the singleton when the claim is null. Multi-tenant deploys won't ; the user signs in, the metadata stays empty, and `organizations.current` keeps returning null until something writes the claim. Phase-2 needs : (a) a `setActiveOrg` tRPC mutation that calls `supabase.auth.admin.updateUserById(userId, { user_metadata: { active_organization_id } })` ; (b) a sign-in side-effect (in [`signInAction`](../../services/web/src/app/(anon)/signin/actions.ts) or the auth `notifySignedIn` subscriber) that pins the claim to the user's first membership when missing ; (c) an org-switcher UI that calls (a). Track in this backlog item until the multi-tenant flag is actually flipped on for someone.

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

- [ ] **[2026-05-05] Account-deletion cron has no scheduler wired.** `POST /cron/process-account-deletions` exists on the api ([services/api/src/server.ts](../../services/api/src/server.ts)) and authenticates via `Authorization: Bearer $CRON_SECRET`, but no Vercel Cron / GitHub Actions / k8s CronJob fires it on a schedule. Until that's connected, expired grace-period rows accumulate in `User.deletedAt` without ever hard-deleting. Fix : pick a scheduler for the target deploy (Vercel Cron is the common case) and document the hook in `services/api/README.md`.

- [ ] **[2026-05-05] Single-tenant redirect chain on `/admin`.** `/admin` → `/admin/organizations` → singleton edit page is three round-trips on a cold hop. Acceptable in dev ; worth a single-tenant fast path that lands `/admin` straight on `/admin/organizations/<singletonId>` when bootstrap status is single + count=1. Same pattern the AdminSidebar tab uses. Saves ~200ms on cold loads.

## White-label gaps

- [ ] **CODE_OF_CONDUCT.md + SECURITY.md still mention `hr@monark.io` / `security@monark.io`.** Replace with placeholders that read from `BRANDING.supportEmail` (or document them as "edit when retargeting") next time those files come up.

- [ ] **shadcn registry URL `ui.monark.io` in `services/web/components.json`.** Should read from an env var so a downstream team can point at their own registry mirror.

- [ ] **Test fixtures hardcode `monark.app` + `noreply@monark.io`.** [packages/notifications/tests/enrich.test.ts](../../packages/notifications/tests/enrich.test.ts) + [email.test.ts](../../packages/notifications/tests/email.test.ts). Should derive from `BRANDING` constants so a downstream team's test suite stays meaningful after retargeting.
