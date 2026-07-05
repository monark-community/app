# @monark/auth

Credentials, session orchestration, and the glue between Supabase Auth and our own `User` table. Every other module treats "who's signed in" as a read from the tRPC context; this module is what populates that context.

Spec: [docs/features-planning/phase-1/auth-login-password.md](../../docs/features-planning/phase-1/auth-login-password.md).

## What's here (Phase 1 MVP)

- `/server` — `authRouter` (tRPC) with `ping`, `session`, `checkPassword`, `signUp`, `notifySignedIn` / `notifySignedOut` / `notifyPasswordChanged`, `markOwnEmailVerified`, `requestConfirmationResend`, plus the `trustedDevices` sub-router (`mine`, `recognize`, `revoke`) and the `totp` sub-router (`status`, `beginEnrollment`, `confirmEnrollment`, `verifyCode`, `verifyRecoveryCode`, `regenerateRecoveryCodes`, `disable`, `isChallengeRequired`, `adminEnforcement`); `signUpUser` orchestrator (public `auth.signUp`, triggers verification email); `checkPassword` (offline rules + HIBP k-anonymity); email-verification helpers (`markEmailVerified`, `recordResendAttempt`, `requireVerifiedEmail`); trusted-device helpers (`recognizeOrRegister`, `listTrustedDevices`, `revokeTrustedDevice`, `DEVICE_COOKIE_NAME`) with per-device Supabase session revocation via the `DeviceSession` join table; TOTP helpers (`beginTotpEnrollment`, `confirmTotpEnrollment`, `verifyTotpCode`, `verifyRecoveryCode`, `regenerateRecoveryCodes`, `disableTotp`, `getTotpStatus`, `isTotpActive`, `requiresTotpChallenge`, `markDeviceTotpVerified`, `adminTotpEnforcement`, `cleanupStaleTotpEnrollments`, `TotpRateLimitError`); account lifecycle (`hardDeleteUser`, `processExpiredDeletions`); AES-256-GCM crypto (`encryptSecret` / `decryptSecret`); SMTP outbound (`sendMail`, `registerNewDeviceEmailListener`); admin client (`getSupabaseAdmin`); event emitters; `getCurrentUser` / `requireUser` read interface.
- `/contracts` — event types (including `EmailVerifiedEvent`, `TrustedDeviceAddedEvent`, `TrustedDeviceRevokedEvent`, `TotpEnabledEvent`, `TotpDisabledEvent`, `TotpRecoveryCodeUsedEvent`), `PASSWORD_RULES` constants, `PasswordCheckResult` + `PasswordFailureReason` types, `checkPasswordOffline` pure function (safe for browser + server), `PASSWORD_RULE_HINTS` map for UI.
- `/client` — placeholder. The web's signup/signin/verification/totp pages live under [`services/web/src/app/signin`](../../services/web/src/app/signin) / [`signup`](../../services/web/src/app/signup) / [`auth/confirm`](../../services/web/src/app/auth/confirm) directly, because they rely on Next-specific primitives (server actions, `redirect()`, `cookies()`).

## Key concepts

- **Supabase is the session source of truth.** We never duplicate session state. Our `User` table shadows Supabase Auth's `auth.users` table 1:1 via matching ids (Supabase UUID).
- **Two compensating writes on signup.** `signUpUser` creates the Supabase Auth user, then inserts the shadow `User` row. If the DB insert throws, we delete the Supabase user so nothing orphans. Logged loudly on either failure.
- **Session hydration is split across services.** The web's Supabase SSR helpers set cookies; the api receives the access token via `Authorization: Bearer <token>` on every tRPC call and verifies it through Supabase's admin API (`getUser(token)`) to populate `ctx.userId` + `ctx.activeOrganizationId`.
- **Active org lives in user metadata.** `user_metadata.active_organization_id` on the Supabase user is the source; the JWT claim flows through to `ctx.activeOrganizationId`. Setting it is the org-switcher flow's job (not yet built).
- **Password rules are one source of truth.** `checkPasswordOffline` runs both in the browser (live rule-by-rule hints on the signup form) and on the server (inside `signUpUser`, before any Supabase call). The server additionally runs `isPasswordBreached` against [haveibeenpwned](https://haveibeenpwned.com/API/v3#PwnedPasswords) using the k-anonymity API so the plaintext never leaves the process. HIBP failures degrade open (log + accept) so a transient outage doesn't block signups.
- **Email verification uses Supabase's public `auth.signUp`.** The SMTP flow (dev: Mailpit; prod: Supabase SMTP or SendGrid) sends the link; the user clicks it, lands at `/auth/confirm?token_hash=...&type=signup`, Supabase verifies the OTP, and we mirror the confirmation into our shadow `User.emailVerifiedAt` via `markEmailVerified`. Resends are rate-limited to 5 per hour per user through the `EmailResendAttempt` table. Other modules opt into verification gating via `requireVerifiedEmail(ctx)`; a failed check surfaces a `ForbiddenError` callers can redirect-on.
- **Trusted devices are cookie-identified, never fingerprinted.** On every successful sign-in / email-verify the web layer calls `auth.trustedDevices.recognize` with the current `monark_device_id` cookie value (if any) plus UA + IP extracted from the request. The api hashes the cookie with SHA-256 and looks for a matching live `TrustedDevice` row for that user; on miss it mints a fresh 32-byte cookie, stores only the hash, and emits `trusted-device.added`. The raw cookie is never persisted. The flow is gated by the `auth.trusted-devices` feature flag (default on); flipping it off skips recognition entirely without a redeploy. Session auth still runs through Supabase independent of the cookie; the device cookie only affects future TOTP-skip decisions.
- **TOTP is our own schema, not Supabase MFA.** Secrets are encrypted at rest with AES-256-GCM (`TOTP_ENCRYPTION_KEY` on the api), and recovery codes are bcrypt-hashed (cost 10). Enrollment is two-step: `beginEnrollment` mints a secret + QR; `confirmEnrollment` takes the first code and, on success, activates the row and returns 10 one-time `XXXX-XXXX-XXXX` recovery codes (returned once, never again). `otplib.authenticator` validates with a ±1 window (30 sec skew tolerated).
- **Sign-in gate uses a pending cookie + middleware, not a Supabase AAL upgrade.** Password auth still establishes the Supabase session immediately. When `requiresTotpChallenge` returns true, `signInAction` writes `monark_totp_pending=<deviceId>` (HTTP-only, 10-min TTL) and redirects to `/signin/totp`; the middleware redirects any other path to that page while the cookie is present, leaving only `/signin`, `/signup`, and `/auth/*` reachable. `verifyTotpChallengeAction` clears the cookie, stamps `TrustedDevice.totpVerifiedAt`, emits `user.signed-in`, and redirects home. Subsequent sign-ins on the same trusted device skip the challenge via the `auth.totp-trust-devices` flag (default on).

## Usage

```ts
// Server action in services/web/src/app/signup/actions.ts
import { signUpUser } from "@monark/auth/server";

await signUpUser(
  { email, password, displayName },
  {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY!,
  },
);
```

```ts
// From any module's tRPC procedure
import { getCurrentUser, requireUser } from "@monark/auth/server";

const user = await getCurrentUser(ctx); // null when unauthenticated
const user = await requireUser(ctx); // throws UnauthorizedError
```

```ts
// From the web
const session = trpc.auth.session.useQuery();
// { userId, activeOrganizationId, signedIn }
```

```tsx
// Live password-rule hints on a form (pure; no network):
import { checkPasswordOffline, PASSWORD_RULE_HINTS } from "@monark/auth/contracts";

const result = checkPasswordOffline(password, { email, displayName });
// result: { ok: true, score } | { ok: false, reasons, score }
// Render PASSWORD_RULE_HINTS[reason] with a checkmark per rule.
```

## Public API

| Import path              | Export                                                                                              | Kind                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `@monark/auth/server`    | `authRouter`                                                                                        | tRPC sub-router mounted under `auth.*`                                                |
| `@monark/auth/server`    | `signUpUser(input, deps)`                                                                           | admin-path user creation + shadow User insert; runs `checkPassword` before admin call |
| `@monark/auth/server`    | `signUpInputSchema`                                                                                 | Zod validator shared between server + forms                                           |
| `@monark/auth/server`    | `checkPassword(pw, ctx)`                                                                            | full rules + HIBP k-anonymity; returns `PasswordCheckResult`                          |
| `@monark/auth/server`    | `emitSignedIn` / `emitSignedOut` / `emitPasswordChanged`                                            | event helpers for the web-side server actions                                         |
| `@monark/auth/server`    | `getCurrentUser(ctx)`                                                                               | resolves `ctx.userId` → `User \| null` via `@monark/users`                            |
| `@monark/auth/server`    | `requireUser(ctx)`                                                                                  | throws `UnauthorizedError` if unauthenticated                                         |
| `@monark/auth/server`    | `requireVerifiedEmail(ctx)`                                                                         | throws `ForbiddenError` if `User.emailVerifiedAt` is null                             |
| `@monark/auth/server`    | `markEmailVerified(userId)`                                                                         | flips shadow `User.emailVerifiedAt` + emits `user.email-verified`                     |
| `@monark/auth/server`    | `recordResendAttempt(userId)`                                                                       | rate-limit gate; returns `{ sent, remainingInWindow, retryAfterSeconds? }`            |
| `@monark/auth/contracts` | `checkPasswordOffline`, `PASSWORD_RULES`, `PASSWORD_RULE_HINTS`, `PasswordCheckResult`, event types | pure; safe for browser                                                                |

tRPC procedures under `auth.*`:

| Procedure                           | Input                                                                     | Output                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `auth.ping`                         | —                                                                         | `{ pong: true, at: string }`                                                                               |
| `auth.session`                      | —                                                                         | `{ userId, activeOrganizationId, signedIn }`                                                               |
| `auth.checkPassword`                | `{ password, email?, displayName? }`                                      | `PasswordCheckResult` (mutation)                                                                           |
| `auth.signUp`                       | `SignUpInput`                                                             | `SignUpResult` (mutation; runs `signUpUser` end-to-end)                                                    |
| `auth.notifySignedIn`               | `{ trustedDeviceId? }?`                                                   | void (mutation; requires `ctx.userId`)                                                                     |
| `auth.notifySignedOut`              | `{ scope: "local" \| "global" }`                                          | void (mutation)                                                                                            |
| `auth.markOwnEmailVerified`         | —                                                                         | void (mutation; uses `ctx.userId` post-verifyOtp)                                                          |
| `auth.requestConfirmationResend`    | `{ email }`                                                               | `ResendActionResult` (mutation)                                                                            |
| `auth.trustedDevices.mine`          | —                                                                         | `TrustedDeviceView[]`                                                                                      |
| `auth.trustedDevices.recognize`     | `{ userAgent?, ip?, country?, existingCookieValue?, supabaseSessionId? }` | `{ deviceId, isNew, rawCookieValue }`                                                                      |
| `auth.trustedDevices.revoke`        | `{ deviceId }`                                                            | void (mutation)                                                                                            |
| `auth.trustedDevices.revokeAll`     | —                                                                         | `{ count }` (mutation; emergency lockout, per-device admin signOut)                                        |
| `auth.totp.status`                  | —                                                                         | `TotpStatus` (`{ enrolled: false }` or `{ enrolled: true, activatedAt, remainingRecoveryCodes }`)          |
| `auth.totp.beginEnrollment`         | —                                                                         | `{ secret, qrSvg }` (mutation; SVG with `currentColor` foreground + transparent background, themed inline) |
| `auth.totp.confirmEnrollment`       | `{ code }`                                                                | `{ recoveryCodes }` (mutation; recovery codes shown once)                                                  |
| `auth.totp.verifyCode`              | `{ code, trustedDeviceId? }`                                              | `{ ok }` (mutation; stamps device on success)                                                              |
| `auth.totp.verifyRecoveryCode`      | `{ code, trustedDeviceId? }`                                              | `{ ok }` (mutation; consumes one code)                                                                     |
| `auth.totp.regenerateRecoveryCodes` | `{ code }`                                                                | `{ recoveryCodes }` (mutation; invalidates old codes)                                                      |
| `auth.totp.disable`                 | `{ code }`                                                                | void (mutation)                                                                                            |
| `auth.totp.isChallengeRequired`     | `{ trustedDeviceId? }?`                                                   | `boolean` (query)                                                                                          |

## Dependencies

- `@monark/db` (Prisma)
- `@monark/common` (event bus, errors, tRPC primitives)
- `@monark/users` (User read interface for `getCurrentUser` / `requireUser`)
- `@monark/feature-flags` (gates the trusted-devices recognition path)
- `@monark/rbac` (admin TOTP enforcement reads role assignments via `adminAssignmentSummary`)
- `@supabase/supabase-js` (admin client)
- `ua-parser-js` (derives human-readable device labels like "Chrome on macOS")
- `otplib` (TOTP generation + validation, ±1 window)
- `qrcode` (SVG string for the enrollment QR ; rewritten to `currentColor` + transparent bg so it themes via the parent's text colour)
- `@monark/branding` (`BRANDING.totpIssuer` is the label users see in their authenticator app)
- `bcryptjs` (recovery code hashing; pure JS so Windows dev works)
- `nodemailer` (transactional outbound for new-device alerts; falls back to log-only when `SMTP_URL` is unset)

## Operational

### Environment

**api** (`services/api/.env`):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
APP_URL=http://localhost:3000
# 32 bytes hex; generate with:
#   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
TOTP_ENCRYPTION_KEY=...
# Outbound mail (new-device alerts, password-change, revoke-all, …).
# Supabase ships Inbucket as the dev mail server ; the SMTP listener is
# exposed via `smtp_port = 54325` in supabase/config.toml. Web UI for
# inspecting captured mail is at http://127.0.0.1:54324 (`pnpm dev:tools mail`).
# Leave SMTP_URL unset to log instead of send.
SMTP_URL=smtp://127.0.0.1:54325
SMTP_FROM=Monark <noreply@monark.io>
```

**web** (`services/web/.env`):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SECRET_KEY=sb_secret_...
```

Pull all four values from `pnpm supabase status`. The server-only `SUPABASE_SECRET_KEY` on web is needed because `signUpUser` runs server-side and needs admin access.

### Runtime topology

- Web middleware at [`services/web/src/middleware.ts`](../../services/web/src/middleware.ts) refreshes the Supabase session cookies on every request (required; without it server components see a stale session after ~1 hour).
- The web-side Supabase client lives in two shapes:
  - [`services/web/src/lib/supabase/browser.ts`](../../services/web/src/lib/supabase/browser.ts) for client components
  - [`services/web/src/lib/supabase/server.ts`](../../services/web/src/lib/supabase/server.ts) for server components + server actions
- The api's token verification lives in [`services/api/src/lib/supabase.ts`](../../services/api/src/lib/supabase.ts) and feeds into the tRPC context in [`services/api/src/trpc/context.ts`](../../services/api/src/trpc/context.ts).

### Creating a MONARK_ADMIN bootstrap user

After signing up your first user, grant them MONARK_ADMIN:

```ts
import { assignRole } from "@monark/rbac/server";

await assignRole({
  userId: "<your supabase uuid>",
  role: "MONARK_ADMIN",
  grantedById: "system",
  reason: "bootstrap",
});
```

## Feature flags

Three flags owned by this module, all registered in [`@monark/feature-flags`](../feature-flags/src/contracts/flags.ts):

| Flag                       | Default | Purpose                                                                                                                                                                                                                                  |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.trusted-devices`     | on      | Kill switch for device tracking. When off, `auth.trustedDevices.recognize` short-circuits; no cookie is minted, no `TrustedDevice` row is written, no `trusted-device.added` event fires. `trustedDeviceId` is always `null` downstream. |
| `auth.totp-trust-devices`  | on      | TOTP-skip policy. When off, `requiresTotpChallenge` always returns `true` for enrolled users; the `TrustedDevice.totpVerifiedAt` stamp is ignored as a skip signal.                                                                      |
| `auth.totp-required-admin` | on      | Enforcement flag read by the admin route guard to soft-wall (day 1) / hard-wall (day 7) admins without TOTP enrolled. MVP defines the flag; the guard itself lands with the admin onboarding pass.                                       |

The first two compose:

| `trusted-devices` | `totp-trust-devices` | Effect                                                                                     |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| on                | on                   | Default. Device recognized ⇒ TOTP skipped after the first pass.                            |
| on                | off                  | Devices are tracked (so "new sign-in" signals work) but TOTP is always challenged.         |
| off               | on                   | No tracking; `totp-trust-devices` has no records to consult, so TOTP is always challenged. |
| off               | off                  | No tracking; TOTP always challenged.                                                       |

`auth.trusted-devices` off makes `auth.totp-trust-devices` effectively a no-op — the latter only matters when the former is on.

## Events emitted

| Event                         | When                                                           | Status                                                                                              |
| ----------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `user.signed-up`              | every `signUpUser` call                                        | emitted                                                                                             |
| `user.signed-in`              | after `signInWithPassword` succeeds                            | emitted (via `emitSignedIn` from the web server action)                                             |
| `user.signed-out`             | `signOutAction`                                                | emitted                                                                                             |
| `user.password-changed`       | password reset / account page password change                  | emitted (via `emitPasswordChanged` from the web server action through `auth.notifyPasswordChanged`) |
| `user.email-verified`         | `/auth/confirm` successfully verified                          | emitted via `markEmailVerified`                                                                     |
| `trusted-device.added`        | first sign-in from a new device (or stale / wrong-user cookie) | emitted via `recognizeOrRegister`                                                                   |
| `trusted-device.revoked`      | user revokes a device or an admin revokes                      | emitted via `revokeTrustedDevice` (`bulk: true` for each row of a bulk sweep)                       |
| `trusted-devices.all-revoked` | emergency lockout (`revokeAllTrustedDevices`)                  | emitted once per bulk run with the actual revoked count                                             |
| `totp.enabled`                | `confirmTotpEnrollment` succeeds                               | emitted                                                                                             |
| `totp.disabled`               | `disableTotp` succeeds                                         | emitted (`triggeredBy: "user"`)                                                                     |
| `totp.recovery-code-used`     | recovery code consumed during challenge                        | emitted                                                                                             |
| `totp.recovery-codes-regenerated` | `regenerateRecoveryCodes` succeeds (old codes invalidated) | emitted with the new-code `count`                                                                   |

## Deferred

- **zxcvbn scoring.** `PasswordCheckResult.score` currently uses a simple length+class heuristic (0-4). Swap in `@zxcvbn-ts/core` when we pull in the auth-aesthetics strength-bar component.
- **`PasswordInput` shadcn primitive.** Today's signup form renders the rule hints inline; the canonical `<PasswordInput showStrengthMeter showHints />` lands with the component library pass.
- **Blur-time HIBP via `auth.checkPassword` mutation.** Wire exists; the signup form currently relies on the server-side check at submit instead of live "this password appears in a breach" feedback.
- **`auth.hibp-check` feature flag.** The spec calls for a kill-switch if HIBP misbehaves; for now the in-code `isPasswordBreached` already degrades open on failure, so the risk is low.
- **Password reset** (`requestPasswordReset`, `completePasswordReset`). Token flow re-uses Supabase's `resetPasswordForEmail` + `updateUser` hooks; lands alongside a /forgot-password page in a later pass.
- **Invite bypass for verification.** Accepting an invite proves email ownership, so `emailVerifiedAt` should be stamped immediately. Ships with the org invite flow.
- **`auth.require-verified-email` feature flag.** Spec calls for a soft-gate vs hard-block toggle; defer to when we actually have verification-gated surfaces.
- **Referral code wiring.** `signUpInputSchema` accepts `referralCode` but `@monark/referral` doesn't consume it yet (Phase 2).
- **Admin override: `resetTotpForUser`.** Support runbook escape hatch when a user loses both authenticator and recovery codes.
- **Cron schedulers.** Functions are ready (`cleanupStaleTotpEnrollments`, `processExpiredDeletions`); only the scheduler glue (Vercel Cron / Supabase pg_cron / GitHub Actions) needs wiring.
- **Distributed-safe rate limit.** `verifyTotpCode`'s in-memory cap is single-process. Multi-instance deployments need Redis (or equivalent) backing.
- **Mailpit-driven E2E happy path.** Playwright smoke is routing-only today; the full signup → verify-email → TOTP-enroll round-trip ships with a Mailpit HTTP polling helper in a follow-up.
- **IP-to-country geo lookup (server-side).** `TrustedDevice.country` is now populated via the hosting platform's edge headers (Vercel `x-vercel-ip-country`, Cloudflare `cf-ipcountry`, CloudFront `cloudfront-viewer-country`, generic `x-country-code`) read by [`recognizeDeviceAfterAuth`](../../services/web/src/lib/trusted-device-cookie.ts) ; reaches the row via the `recognize` mutation's `country` input. Self-hosted-no-proxy still leaves the field null until a paid GeoIP dataset is wired.
- **180-day stale-device GC.** Background job to auto-revoke devices inactive beyond the window.
- **Full auth-aesthetics styling.** The current forms are functional-minimum; the [`auth-aesthetics.md`](../../docs/features-planning/phase-1/auth-aesthetics.md) spec (two-column layout, ambient gradient, forced dark palette, polished typography) lands as a later pass.
- **Active-org selection flow.** `user_metadata.active_organization_id` is the channel; the org switcher UI writes to it.
- **OAuth / social login, passwordless / magic links, SSO, biometrics.** Not in Phase 1 scope.
