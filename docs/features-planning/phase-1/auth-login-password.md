# Auth — Login & Password

## Context

The primary credentials path. Everything else in the auth module (email validation, password strength, trusted devices, TOTP) is built on top of this. We're using Supabase Auth as the underlying credential store and session provider, and layering our own logic where Supabase doesn't go far enough (TOTP UX, trusted-device heuristics, role resolution).

This is the first thing a user actually sees, which means it's also the first thing that can feel broken. Getting the shape right — sign-up, sign-in, sign-out, session refresh, password reset — is non-negotiable foundation.

## Goals

- Email + password sign-up that persists a `users` row and links it to a Supabase Auth user.
- Email + password sign-in that issues a session and redirects to the user's default org home.
- Sign-out that kills the session on the server and clears cookies on the client.
- Forgot-password flow: request reset → email with tokenized link → set new password.
- Session is readable from any server component via a single `getCurrentUser()` call.
- Supabase Auth cookies correctly round-trip through Next 16 App Router (the `@supabase/ssr` integration points are fragile).

## Non-goals

- No OAuth / social login at Phase 1 launch. **Shipped since**: Google / Microsoft / GitHub landed as a follow-on pass ; see [packages/auth/README.md](../../../packages/auth/README.md) § Social sign-in setup. Apple is still out.
- No magic-link-only auth. Passwords stay.
- No "remember me" nuance beyond Supabase's default session expiry; we cover that in `auth-trusted-devices.md`.
- No CAPTCHA at launch. Added if abuse patterns emerge.

## User stories

- **As a new ambassador**, I can sign up with my email and a password and land on a guided onboarding flow.
- **As a returning developer**, I can sign in and land on my developer dashboard.
- **As anyone**, I can sign out from the user menu.
- **As a user who forgot their password**, I can request a reset, click the email link, and set a new password. My existing sessions on other devices are invalidated.

## Data model

Supabase Auth stores the credential; we shadow it with our own `User` table for app-owned fields.

```prisma
model User {
  id              String   @id                    // matches supabase auth.users.id (UUID)
  email           String   @unique
  emailVerifiedAt DateTime?
  displayName     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?                        // soft delete; see users.md

  // relations (declared in respective modules' schemas):
  //   Organization memberships, RoleAssignments, TrustedDevices, TotpSecret
}
```

Sessions are handled entirely by Supabase (stored in its own `auth.sessions` table). We don't duplicate.

## API surface

### Server actions (primary write path)

```ts
// packages/auth/src/server/procedures/sign-up.ts
"use server";
export async function signUp(input: SignUpInput): Promise<SignUpResult>;

// packages/auth/src/server/procedures/sign-in.ts
("use server");
export async function signIn(input: SignInInput): Promise<SignInResult>;

// packages/auth/src/server/procedures/sign-out.ts
("use server");
export async function signOut(): Promise<void>;

// packages/auth/src/server/procedures/password-reset.ts
("use server");
export async function requestPasswordReset(email: string): Promise<void>; // idempotent — always returns success for security
export async function completePasswordReset(token: string, newPassword: string): Promise<void>;
```

### Read interface (exposed to other modules)

```ts
// packages/auth/src/server/index.ts
export async function getCurrentUser(): Promise<User | null>;
export async function requireUser(): Promise<User>; // throws/redirects to /signin if null
```

### Zod schemas

```ts
const SignUpInput = z.object({
  email: z.string().email(),
  password: z.string().min(12), // see auth-password-strength.md for the real rules
  displayName: z.string().min(1).max(80).optional(),
  referralCode: z.string().optional(), // wired through to phase-2/referral
});

const SignInInput = z.object({
  email: z.string().email(),
  password: z.string().min(1), // don't leak min-length on sign-in
});
```

## UI flows

### Sign-up (`/signup`)

- Fields: email, password, confirm-password, display name (optional), referral code (pre-filled from `?ref=` query param).
- Live password-strength meter (details in `auth-password-strength.md`).
- On submit:
  1. Server action calls `supabase.auth.signUp` with `emailRedirectTo: {APP_URL}/auth/confirm`.
  2. Inserts corresponding `User` row (same id).
  3. Emits `user.signed-up` domain event.
  4. Redirects to `/signup/check-email` (see `auth-email-validation.md`).
- Error states: email already exists (soft error, suggest sign-in), password too weak (inline), server error (toast + retry).

### Sign-in (`/signin`)

- Fields: email, password. Plus "Forgot password?" link.
- On submit:
  1. Server action calls `supabase.auth.signInWithPassword`.
  2. If `emailVerifiedAt` is null, redirect to `/signup/check-email` with a "resend confirmation" CTA.
  3. If TOTP is enabled on the user (see `auth-totp.md`), redirect to `/signin/totp` with the partial session.
  4. Otherwise issue the full session and redirect to `/app` (or wherever RBAC sends this role).
- Error: generic "invalid credentials" — never distinguish "no such user" vs "wrong password" in the UI.

### Sign-out (`/app/signout` via form POST or user-menu item)

- Server action calls `supabase.auth.signOut({ scope: "local" })`. For "sign out of all devices" (triggered from `/account/security`), scope is `"global"`.
- Redirect to `/` (marketing).

### Forgot password (`/forgot-password`)

- Single field: email.
- Submit → `supabase.auth.resetPasswordForEmail` with `redirectTo: {APP_URL}/reset-password`.
- Always show the same "if an account exists, we sent an email" message regardless of result.

### Reset password (`/reset-password?token=...`)

- Fields: new password, confirm. Strength meter.
- Submit → `supabase.auth.updateUser({ password })` within the token-carrying session, then force a global sign-out on that user (so other devices re-auth with the new password).
- Redirect to `/signin` with a success toast.

## Dependencies

- `users` (core, same phase): writes `User` rows on signup.
- `feature-flags` (core, same phase): the `auth.signup` flag can disable public signup (e.g., during invite-only periods).
- Supabase Auth: external but first-party to our stack.

## Integration points

### Events emitted

```ts
export const USER_SIGNED_UP = "user.signed-up";
export type UserSignedUpEvent = {
  userId: string;
  email: string;
  referralCode?: string;
  at: Date;
};

export const USER_SIGNED_IN = "user.signed-in";
export type UserSignedInEvent = {
  userId: string;
  at: Date;
  trustedDeviceId?: string; // if this device was recognized
};

export const PASSWORD_CHANGED = "user.password-changed";
export type PasswordChangedEvent = {
  userId: string;
  at: Date;
  triggeredBy: "user" | "reset";
};
```

The referral module (phase 2) listens to `USER_SIGNED_UP` to attribute; the trusted-devices module listens to `USER_SIGNED_IN` to update last-seen.

### Session shape

`getCurrentUser()` returns a normalized `User` with `id`, `email`, `displayName`, `emailVerifiedAt`, and an `activeOrganizationId` resolved from the session's `org_id` claim (see `organization-management.md`). Consumers should never query Supabase directly.

## Edge cases & risks

- **Cookies in Server Components.** Next 16 + `@supabase/ssr` is fussy about where you instantiate the Supabase client. Use the helper at `services/web/src/lib/supabase/server.ts` and never construct one ad-hoc in a server component.
- **Middleware refresh.** Supabase sessions auto-refresh via middleware; the middleware must update the response cookies or the client goes stale. Document in `auth/README.md`.
- **User row gets out of sync with Supabase.** If a Supabase signup succeeds but our DB insert fails, we have an orphan. Wrap both in a transaction; on DB failure, call `supabase.auth.admin.deleteUser` to compensate. Log loudly — this shouldn't happen often.
- **Password reset token reuse.** Supabase handles this; we just trust it. Log the event.
- **Race: sign-up with referral that doesn't exist.** Validate `referralCode` against Phase 2 referral module; ignore silently if absent (don't fail signup over an invalid code).

## Success metrics

- Sign-up completion rate (form view → verified email): track.
- Sign-in median latency (server action start → redirect): < 400ms.
- Zero session-state bugs reported ("I logged in and got bounced back to signin").

## Implementation notes

- Use server actions for all mutations. No client-side Supabase writes — keeps service role behavior centralized.
- Always return a typed `Result<T, AuthError>` from server actions; never throw across the action boundary.
- `displayName` is optional and editable post-signup in `/account`. Don't gate signup on it.
- Rate-limit sign-in attempts per email+IP (e.g., 5/minute) using a Redis or Postgres-advisory-lock approach. Concrete implementation: Supabase has built-in rate limits; augment with an app-level middleware if the default is too loose.

## Out of scope

- OAuth / social login (**since shipped** for Google / Microsoft / GitHub ; Apple still future)
- Passwordless / magic link (future)
- SSO for enterprise (future)
- Biometric / passkey (future; would land alongside trusted-devices work)
