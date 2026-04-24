# @monark/auth

Credentials, session orchestration, and the glue between Supabase Auth and our own `User` table. Every other module treats "who's signed in" as a read from the tRPC context; this module is what populates that context.

Spec: [docs/features-planning/phase-1/auth-login-password.md](../../docs/features-planning/phase-1/auth-login-password.md).

## What's here (Phase 1 MVP)

- `/server` — `authRouter` (tRPC) with `ping` and `session` queries, `signUpUser` orchestrator, event emitters, `getCurrentUser` / `requireUser` read interface.
- `/contracts` — event types for the auth lifecycle (`UserSignedUpEvent`, `UserSignedInEvent`, `UserSignedOutEvent`, `PasswordChangedEvent`).
- `/client` — placeholder. The web's signin/signup pages live under [`services/web/src/app/signin`](../../services/web/src/app/signin) / [`signup`](../../services/web/src/app/signup) directly, because they rely on Next-specific primitives (server actions, `redirect()`, `cookies()`).

## Key concepts

- **Supabase is the session source of truth.** We never duplicate session state. Our `User` table shadows Supabase Auth's `auth.users` table 1:1 via matching ids (Supabase UUID).
- **Two compensating writes on signup.** `signUpUser` creates the Supabase Auth user, then inserts the shadow `User` row. If the DB insert throws, we delete the Supabase user so nothing orphans. Logged loudly on either failure.
- **Session hydration is split across services.** The web's Supabase SSR helpers set cookies; the api receives the access token via `Authorization: Bearer <token>` on every tRPC call and verifies it through Supabase's admin API (`getUser(token)`) to populate `ctx.userId` + `ctx.activeOrganizationId`.
- **Active org lives in user metadata.** `user_metadata.active_organization_id` on the Supabase user is the source; the JWT claim flows through to `ctx.activeOrganizationId`. Setting it is the org-switcher flow's job (not yet built).

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

## Public API

| Import path                | Export                  | Kind |
|----------------------------|-------------------------|------|
| `@monark/auth/server`      | `authRouter`            | tRPC sub-router mounted under `auth.*` |
| `@monark/auth/server`      | `signUpUser(input, deps)` | admin-path user creation + shadow User insert |
| `@monark/auth/server`      | `signUpInputSchema`     | Zod validator shared between server + forms |
| `@monark/auth/server`      | `emitSignedIn` / `emitSignedOut` / `emitPasswordChanged` | event helpers for the web-side server actions |
| `@monark/auth/server`      | `getCurrentUser(ctx)`   | resolves `ctx.userId` → `User \| null` via `@monark/users` |
| `@monark/auth/server`      | `requireUser(ctx)`      | throws `UnauthorizedError` if unauthenticated |
| `@monark/auth/contracts`   | event types, `AuthEvents` | |

tRPC procedures under `auth.*`:

| Procedure         | Input | Output |
|-------------------|-------|--------|
| `auth.ping`       | —     | `{ pong: true, at: string }` |
| `auth.session`    | —     | `{ userId, activeOrganizationId, signedIn }` |

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

## Deferred

- **Password reset** (`requestPasswordReset`, `completePasswordReset`). Token flow shared with `auth-email-validation`; both land together.
- **Email verification UX** (`/signup/check-email`, "resend confirmation" CTA). Local Supabase auto-confirms today; production flow ships with `@monark/auth-email-validation`.
- **Referral code wiring.** `signUpInputSchema` accepts `referralCode` but `@monark/referral` doesn't consume it yet (Phase 2).
- **TOTP challenge step** (`/signin/totp`). Gated on `@monark/auth-totp`.
- **Trusted-device skip logic.** Gated on `@monark/auth-trusted-devices`.
- **Rate limiting.** Supabase's default applies; an app-level layer lands if the default is too loose.
- **Full auth-aesthetics styling.** The current forms are functional-minimum; the [`auth-aesthetics.md`](../../docs/features-planning/phase-1/auth-aesthetics.md) spec (two-column layout, ambient gradient, forced dark palette, polished typography) lands as a later pass.
- **Active-org selection flow.** `user_metadata.active_organization_id` is the channel; the org switcher UI writes to it.
- **OAuth / social login, passwordless / magic links, SSO, biometrics.** Not in Phase 1 scope.
