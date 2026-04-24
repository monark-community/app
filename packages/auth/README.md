# @monark/auth

Credentials, session orchestration, and the glue between Supabase Auth and our own `User` table. Every other module treats "who's signed in" as a read from the tRPC context; this module is what populates that context.

Spec: [docs/features-planning/phase-1/auth-login-password.md](../../docs/features-planning/phase-1/auth-login-password.md).

## What's here (Phase 1 MVP)

- `/server` — `authRouter` (tRPC) with `ping`, `session`, and `checkPassword`; `signUpUser` orchestrator (public `auth.signUp`, triggers verification email); `checkPassword` (offline rules + HIBP k-anonymity); email-verification helpers (`markEmailVerified`, `recordResendAttempt`, `requireVerifiedEmail`); event emitters; `getCurrentUser` / `requireUser` read interface.
- `/contracts` — event types (including `EmailVerifiedEvent`), `PASSWORD_RULES` constants, `PasswordCheckResult` + `PasswordFailureReason` types, `checkPasswordOffline` pure function (safe for browser + server), `PASSWORD_RULE_HINTS` map for UI.
- `/client` — placeholder. The web's signup/signin/verification pages live under [`services/web/src/app/signin`](../../services/web/src/app/signin) / [`signup`](../../services/web/src/app/signup) / [`auth/confirm`](../../services/web/src/app/auth/confirm) directly, because they rely on Next-specific primitives (server actions, `redirect()`, `cookies()`).

## Key concepts

- **Supabase is the session source of truth.** We never duplicate session state. Our `User` table shadows Supabase Auth's `auth.users` table 1:1 via matching ids (Supabase UUID).
- **Two compensating writes on signup.** `signUpUser` creates the Supabase Auth user, then inserts the shadow `User` row. If the DB insert throws, we delete the Supabase user so nothing orphans. Logged loudly on either failure.
- **Session hydration is split across services.** The web's Supabase SSR helpers set cookies; the api receives the access token via `Authorization: Bearer <token>` on every tRPC call and verifies it through Supabase's admin API (`getUser(token)`) to populate `ctx.userId` + `ctx.activeOrganizationId`.
- **Active org lives in user metadata.** `user_metadata.active_organization_id` on the Supabase user is the source; the JWT claim flows through to `ctx.activeOrganizationId`. Setting it is the org-switcher flow's job (not yet built).
- **Password rules are one source of truth.** `checkPasswordOffline` runs both in the browser (live rule-by-rule hints on the signup form) and on the server (inside `signUpUser`, before any Supabase call). The server additionally runs `isPasswordBreached` against [haveibeenpwned](https://haveibeenpwned.com/API/v3#PwnedPasswords) using the k-anonymity API so the plaintext never leaves the process. HIBP failures degrade open (log + accept) so a transient outage doesn't block signups.
- **Email verification uses Supabase's public `auth.signUp`.** The SMTP flow (dev: Mailpit; prod: Supabase SMTP or SendGrid) sends the link; the user clicks it, lands at `/auth/confirm?token_hash=...&type=signup`, Supabase verifies the OTP, and we mirror the confirmation into our shadow `User.emailVerifiedAt` via `markEmailVerified`. Resends are rate-limited to 5 per hour per user through the `EmailResendAttempt` table. Other modules opt into verification gating via `requireVerifiedEmail(ctx)`; a failed check surfaces a `ForbiddenError` callers can redirect-on.

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
| `auth.checkPassword`  | `{ password, email?, displayName? }` | `PasswordCheckResult` (mutation; blur-time HIBP check) |

## Dependencies

- `@monark/db` (Prisma)
- `@monark/common` (event bus, errors, tRPC primitives)
- `@monark/users` (User read interface for `getCurrentUser` / `requireUser`)
- `@supabase/supabase-js` (admin client)

## Operational

### Environment

**api** (`services/api/.env`):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SECRET_KEY=sb_secret_...
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

## Events emitted

| Event                  | When                                           | Status |
|------------------------|------------------------------------------------|--------|
| `user.signed-up`       | every `signUpUser` call                         | emitted |
| `user.signed-in`       | after `signInWithPassword` succeeds             | emitted (via `emitSignedIn` from the web server action) |
| `user.signed-out`      | `signOutAction`                                 | emitted |
| `user.password-changed`| password reset / account page password change   | type declared, not yet emitted |
| `user.email-verified`  | `/auth/confirm` successfully verified            | emitted via `markEmailVerified` |

## Deferred

- **zxcvbn scoring.** `PasswordCheckResult.score` currently uses a simple length+class heuristic (0-4). Swap in `@zxcvbn-ts/core` when we pull in the auth-aesthetics strength-bar component.
- **`PasswordInput` shadcn primitive.** Today's signup form renders the rule hints inline; the canonical `<PasswordInput showStrengthMeter showHints />` lands with the component library pass.
- **Blur-time HIBP via `auth.checkPassword` mutation.** Wire exists; the signup form currently relies on the server-side check at submit instead of live "this password appears in a breach" feedback.
- **`auth.hibp-check` feature flag.** The spec calls for a kill-switch if HIBP misbehaves; for now the in-code `isPasswordBreached` already degrades open on failure, so the risk is low.
- **Password reset** (`requestPasswordReset`, `completePasswordReset`). Token flow re-uses Supabase's `resetPasswordForEmail` + `updateUser` hooks; lands alongside a /forgot-password page in a later pass.
- **Invite bypass for verification.** Accepting an invite proves email ownership, so `emailVerifiedAt` should be stamped immediately. Ships with the org invite flow.
- **`auth.require-verified-email` feature flag.** Spec calls for a soft-gate vs hard-block toggle; defer to when we actually have verification-gated surfaces.
- **Referral code wiring.** `signUpInputSchema` accepts `referralCode` but `@monark/referral` doesn't consume it yet (Phase 2).
- **TOTP challenge step** (`/signin/totp`). Gated on `@monark/auth-totp`.
- **Trusted-device skip logic.** Gated on `@monark/auth-trusted-devices`.
- **Rate limiting.** Supabase's default applies; an app-level layer lands if the default is too loose.
- **Full auth-aesthetics styling.** The current forms are functional-minimum; the [`auth-aesthetics.md`](../../docs/features-planning/phase-1/auth-aesthetics.md) spec (two-column layout, ambient gradient, forced dark palette, polished typography) lands as a later pass.
- **Active-org selection flow.** `user_metadata.active_organization_id` is the channel; the org switcher UI writes to it.
- **OAuth / social login, passwordless / magic links, SSO, biometrics.** Not in Phase 1 scope.
