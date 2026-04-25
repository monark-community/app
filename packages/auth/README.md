# @monark/auth

Credentials, session orchestration, and the glue between Supabase Auth and our own `User` table. Every other module treats "who's signed in" as a read from the tRPC context; this module is what populates that context.

Spec: [docs/features-planning/phase-1/auth-login-password.md](../../docs/features-planning/phase-1/auth-login-password.md).

## What's here (Phase 1 MVP)

- `/server` — `authRouter` (tRPC) with `ping`, `session`, `checkPassword`, `signUp`, `notifySignedIn` / `notifySignedOut`, `markOwnEmailVerified`, `requestConfirmationResend`, plus the `trustedDevices` sub-router (`mine`, `recognize`, `revoke`) and the `totp` sub-router (`status`, `beginEnrollment`, `confirmEnrollment`, `verifyCode`, `verifyRecoveryCode`, `regenerateRecoveryCodes`, `disable`, `isChallengeRequired`); `signUpUser` orchestrator (public `auth.signUp`, triggers verification email); `checkPassword` (offline rules + HIBP k-anonymity); email-verification helpers (`markEmailVerified`, `recordResendAttempt`, `requireVerifiedEmail`); trusted-device helpers (`recognizeOrRegister`, `listTrustedDevices`, `revokeTrustedDevice`, `DEVICE_COOKIE_NAME`); TOTP helpers (`beginTotpEnrollment`, `confirmTotpEnrollment`, `verifyTotpCode`, `verifyRecoveryCode`, `regenerateRecoveryCodes`, `disableTotp`, `getTotpStatus`, `isTotpActive`, `requiresTotpChallenge`, `markDeviceTotpVerified`); AES-256-GCM crypto (`encryptSecret` / `decryptSecret`); event emitters; `getCurrentUser` / `requireUser` read interface.
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
import { signUpUser } from "@monark/auth/server"

await signUpUser(
  { email, password, displayName },
  {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY!,
  },
)
```

```ts
// From any module's tRPC procedure
import { getCurrentUser, requireUser } from "@monark/auth/server"

const user = await getCurrentUser(ctx)      // null when unauthenticated
const user = await requireUser(ctx)         // throws UnauthorizedError
```

```ts
// From the web
const session = trpc.auth.session.useQuery()
// { userId, activeOrganizationId, signedIn }
```

```tsx
// Live password-rule hints on a form (pure; no network):
import { checkPasswordOffline, PASSWORD_RULE_HINTS } from "@monark/auth/contracts"

const result = checkPasswordOffline(password, { email, displayName })
// result: { ok: true, score } | { ok: false, reasons, score }
// Render PASSWORD_RULE_HINTS[reason] with a checkmark per rule.
```

## Public API

| Import path                | Export                  | Kind |
|----------------------------|-------------------------|------|
| `@monark/auth/server`      | `authRouter`            | tRPC sub-router mounted under `auth.*` |
| `@monark/auth/server`      | `signUpUser(input, deps)` | admin-path user creation + shadow User insert; runs `checkPassword` before admin call |
| `@monark/auth/server`      | `signUpInputSchema`     | Zod validator shared between server + forms |
| `@monark/auth/server`      | `checkPassword(pw, ctx)` | full rules + HIBP k-anonymity; returns `PasswordCheckResult` |
| `@monark/auth/server`      | `emitSignedIn` / `emitSignedOut` / `emitPasswordChanged` | event helpers for the web-side server actions |
| `@monark/auth/server`      | `getCurrentUser(ctx)`   | resolves `ctx.userId` → `User \| null` via `@monark/users` |
| `@monark/auth/server`      | `requireUser(ctx)`      | throws `UnauthorizedError` if unauthenticated |
| `@monark/auth/server`      | `requireVerifiedEmail(ctx)` | throws `ForbiddenError` if `User.emailVerifiedAt` is null |
| `@monark/auth/server`      | `markEmailVerified(userId)` | flips shadow `User.emailVerifiedAt` + emits `user.email-verified` |
| `@monark/auth/server`      | `recordResendAttempt(userId)` | rate-limit gate; returns `{ sent, remainingInWindow, retryAfterSeconds? }` |
| `@monark/auth/contracts`   | `checkPasswordOffline`, `PASSWORD_RULES`, `PASSWORD_RULE_HINTS`, `PasswordCheckResult`, event types | pure; safe for browser |

tRPC procedures under `auth.*`:

| Procedure         | Input | Output |
|-------------------|-------|--------|
| `auth.ping`           | —     | `{ pong: true, at: string }` |
| `auth.session`        | —     | `{ userId, activeOrganizationId, signedIn }` |
| `auth.checkPassword`  | `{ password, email?, displayName? }` | `PasswordCheckResult` (mutation) |
| `auth.signUp`         | `SignUpInput` | `SignUpResult` (mutation; runs `signUpUser` end-to-end) |
| `auth.notifySignedIn` | `{ trustedDeviceId? }?` | void (mutation; requires `ctx.userId`) |
| `auth.notifySignedOut`| `{ scope: "local" \| "global" }` | void (mutation) |
| `auth.markOwnEmailVerified` | — | void (mutation; uses `ctx.userId` post-verifyOtp) |
| `auth.requestConfirmationResend` | `{ email }` | `ResendActionResult` (mutation) |
| `auth.trustedDevices.mine`     | — | `TrustedDeviceView[]` |
| `auth.trustedDevices.recognize`| `{ userAgent?, ip?, existingCookieValue? }` | `{ deviceId, isNew, rawCookieValue }` |
| `auth.trustedDevices.revoke`   | `{ deviceId }` | void (mutation) |
| `auth.totp.status`                  | — | `TotpStatus` (`{ enrolled: false }` or `{ enrolled: true, activatedAt, remainingRecoveryCodes }`) |
| `auth.totp.beginEnrollment`         | — | `{ secret, qrDataUrl }` (mutation) |
| `auth.totp.confirmEnrollment`       | `{ code }` | `{ recoveryCodes }` (mutation; recovery codes shown once) |
| `auth.totp.verifyCode`              | `{ code, trustedDeviceId? }` | `{ ok }` (mutation; stamps device on success) |
| `auth.totp.verifyRecoveryCode`      | `{ code, trustedDeviceId? }` | `{ ok }` (mutation; consumes one code) |
| `auth.totp.regenerateRecoveryCodes` | `{ code }` | `{ recoveryCodes }` (mutation; invalidates old codes) |
| `auth.totp.disable`                 | `{ code }` | void (mutation) |
| `auth.totp.isChallengeRequired`     | `{ trustedDeviceId? }?` | `boolean` (query) |

## Dependencies

- `@monark/db` (Prisma)
- `@monark/common` (event bus, errors, tRPC primitives)
- `@monark/users` (User read interface for `getCurrentUser` / `requireUser`)
- `@monark/feature-flags` (gates the trusted-devices recognition path)
- `@supabase/supabase-js` (admin client)
- `ua-parser-js` (derives human-readable device labels like "Chrome on macOS")
- `otplib` (TOTP generation + validation, ±1 window)
- `qrcode` (PNG data URL for the enrollment QR)
- `bcryptjs` (recovery code hashing; pure JS so Windows dev works)

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
import { assignRole } from "@monark/rbac/server"

await assignRole({
  userId: "<your supabase uuid>",
  role: "MONARK_ADMIN",
  grantedById: "system",
  reason: "bootstrap",
})
```

## Feature flags

Three flags owned by this module, all registered in [`@monark/feature-flags`](../feature-flags/src/contracts/flags.ts):

| Flag | Default | Purpose |
|---|---|---|
| `auth.trusted-devices` | on | Kill switch for device tracking. When off, `auth.trustedDevices.recognize` short-circuits; no cookie is minted, no `TrustedDevice` row is written, no `trusted-device.added` event fires. `trustedDeviceId` is always `null` downstream. |
| `auth.totp-trust-devices` | on | TOTP-skip policy. When off, `requiresTotpChallenge` always returns `true` for enrolled users; the `TrustedDevice.totpVerifiedAt` stamp is ignored as a skip signal. |
| `auth.totp-required-admin` | on | Enforcement flag read by the admin route guard to soft-wall (day 1) / hard-wall (day 7) admins without TOTP enrolled. MVP defines the flag; the guard itself lands with the admin onboarding pass. |

The first two compose:

| `trusted-devices` | `totp-trust-devices` | Effect |
|---|---|---|
| on | on | Default. Device recognized ⇒ TOTP skipped after the first pass. |
| on | off | Devices are tracked (so "new sign-in" signals work) but TOTP is always challenged. |
| off | on | No tracking; `totp-trust-devices` has no records to consult, so TOTP is always challenged. |
| off | off | No tracking; TOTP always challenged. |

`auth.trusted-devices` off makes `auth.totp-trust-devices` effectively a no-op — the latter only matters when the former is on.

## Events emitted

| Event                  | When                                           | Status |
|------------------------|------------------------------------------------|--------|
| `user.signed-up`       | every `signUpUser` call                         | emitted |
| `user.signed-in`       | after `signInWithPassword` succeeds             | emitted (via `emitSignedIn` from the web server action) |
| `user.signed-out`      | `signOutAction`                                 | emitted |
| `user.password-changed`| password reset / account page password change   | type declared, not yet emitted |
| `user.email-verified`  | `/auth/confirm` successfully verified            | emitted via `markEmailVerified` |
| `trusted-device.added` | first sign-in from a new device (or stale / wrong-user cookie) | emitted via `recognizeOrRegister` |
| `trusted-device.revoked` | user revokes a device or an admin revokes | emitted via `revokeTrustedDevice` |
| `totp.enabled`         | `confirmTotpEnrollment` succeeds                | emitted |
| `totp.disabled`        | `disableTotp` succeeds                          | emitted (`triggeredBy: "user"`) |
| `totp.recovery-code-used` | recovery code consumed during challenge       | emitted |

## Deferred

- **zxcvbn scoring.** `PasswordCheckResult.score` currently uses a simple length+class heuristic (0-4). Swap in `@zxcvbn-ts/core` when we pull in the auth-aesthetics strength-bar component.
- **`PasswordInput` shadcn primitive.** Today's signup form renders the rule hints inline; the canonical `<PasswordInput showStrengthMeter showHints />` lands with the component library pass.
- **Blur-time HIBP via `auth.checkPassword` mutation.** Wire exists; the signup form currently relies on the server-side check at submit instead of live "this password appears in a breach" feedback.
- **`auth.hibp-check` feature flag.** The spec calls for a kill-switch if HIBP misbehaves; for now the in-code `isPasswordBreached` already degrades open on failure, so the risk is low.
- **Password reset** (`requestPasswordReset`, `completePasswordReset`). Token flow re-uses Supabase's `resetPasswordForEmail` + `updateUser` hooks; lands alongside a /forgot-password page in a later pass.
- **Invite bypass for verification.** Accepting an invite proves email ownership, so `emailVerifiedAt` should be stamped immediately. Ships with the org invite flow.
- **`auth.require-verified-email` feature flag.** Spec calls for a soft-gate vs hard-block toggle; defer to when we actually have verification-gated surfaces.
- **Referral code wiring.** `signUpInputSchema` accepts `referralCode` but `@monark/referral` doesn't consume it yet (Phase 2).
- **`/account/security/totp` settings page.** User-facing enroll / disable / regenerate flow; MVP only exposes the enrollment primitives through the dev overlay.
- **Admin TOTP enforcement.** The `auth.totp-required-admin` flag is wired in the registry (default off) but `rbac`-aware soft-wall (day 1) + hard-wall (day 7) redirects land with the admin onboarding pass.
- **Rate limiting** (`verifyTotpCode`). Spec calls for 5/min per user; MVP accepts any cadence and relies on otplib's ±1 window for baseline safety.
- **Admin override: `resetTotpForUser`.** Support runbook escape hatch when a user loses both authenticator and recovery codes.
- **Stale-enrollment cleanup.** Spec calls for a cron that drops un-activated enrollments > 24h old; MVP skips (`beginEnrollment` already replaces any prior un-activated row).
- **`/account/security/devices` page.** User-facing list + per-device rename + revoke + bulk "revoke all others"; MVP only exposes the list / revoke through the dev overlay.
- **New-device notification email.** Planned transactional send ("New sign-in from Chrome on macOS…") linking back to the security page; needs email provider wiring.
- **Per-device Supabase session revocation.** Today, `revokeTrustedDevice` marks `revokedAt` but does not revoke the associated Supabase sessions (we'd need a `DeviceSession(deviceId, supabaseSessionId)` join table). Phase 1.1.
- **IP country resolution.** `country` column exists but isn't populated; needs a geo provider.
- **Trusted-device-aware TOTP skip.** Will consume `auth.trustedDevices.mine` / the cookie at sign-in time once the TOTP module lands.
- **180-day stale-device GC.** Background job to auto-revoke devices inactive beyond the window.
- **Rate limiting.** Supabase's default applies; an app-level layer lands if the default is too loose.
- **Full auth-aesthetics styling.** The current forms are functional-minimum; the [`auth-aesthetics.md`](../../docs/features-planning/phase-1/auth-aesthetics.md) spec (two-column layout, ambient gradient, forced dark palette, polished typography) lands as a later pass.
- **Active-org selection flow.** `user_metadata.active_organization_id` is the channel; the org switcher UI writes to it.
- **OAuth / social login, passwordless / magic links, SSO, biometrics.** Not in Phase 1 scope.
