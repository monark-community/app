# Auth — Email Validation

## Context

Email validation is the bridge between "user filled a form" and "user actually owns the address they typed." Without it, we accept typos into our user database, onboarding emails bounce, and password-reset flows become unusable. The starter brief lists this as a required auth sub-feature.

Supabase Auth handles the token lifecycle (issue, email, verify). Our job is the UX around it: the landing pages, the resend flow, what we do with a user whose email isn't verified yet, and how other modules can tell.

## Goals

- Verify that an email address is owned by the signer-upper before granting full app access.
- A `check-email` page that explains what to do after signup.
- A `/auth/confirm` callback that completes verification and redirects to the right place.
- A "resend confirmation email" flow with rate limiting.
- Other modules can check `user.emailVerifiedAt` to decide whether to let someone past a gate.
- Verification can be deferred for invited users who sign up via an invite link (the invite itself implies ownership).

## Non-goals

- No MX / SMTP liveness check on the email at signup. Supabase will try to send; if it bounces, we'll know through their dashboard. Over-engineering pre-send validation is a waste.
- No "email allow-list" by domain. Monark accepts any valid-looking email.
- No ability to change email without re-verification. Email change is a separate flow (out of Phase 1 scope; covered in `users.md`).

## User stories

- **As someone who just signed up**, I see a page telling me to check my inbox and I receive an email within a minute.
- **As someone who clicked the confirmation link**, I'm signed in automatically and land on the onboarding flow for my role.
- **As someone whose email didn't arrive**, I can request a resend, but not infinitely.
- **As someone who never verified**, I can sign in but am gently gated on features that actually email me (notifications, vote receipts) until I do.
- **As a developer consuming the auth module**, I can read `user.emailVerifiedAt` and reject a request that needs a verified email with a predictable error.

## Data model

Lives on `User` (from `auth-login-password.md`):

```prisma
model User {
  // ...
  emailVerifiedAt DateTime?
  // ...
}
```

No extra tables. Supabase's internal `auth.users.email_confirmed_at` is the source of truth; we mirror it into our `User.emailVerifiedAt` via a sync on the confirmation callback and via a Supabase webhook for out-of-band changes.

Rate-limit tracking:

```prisma
model EmailResendAttempt {
  id      String   @id @default(cuid())
  userId  String
  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  at      DateTime @default(now())

  @@index([userId, at])
}
```

Simple table; query last 5 entries to enforce a 5-per-hour cap.

## API surface

```ts
// packages/auth/src/server/procedures/email-verification.ts

"use server";
export async function confirmEmail(token: string): Promise<ConfirmResult>;
//   Called from /auth/confirm route after the user clicks the email link.

("use server");
export async function resendConfirmationEmail(): Promise<ResendResult>;
//   Called from the /signup/check-email page. Requires a partial session
//   (user signed up but hasn't confirmed yet).
```

Read interface already covered by `users.getById(id).emailVerifiedAt` — no separate export needed.

Helper guard for other modules:

```ts
// packages/auth/src/server/index.ts
export async function requireVerifiedEmail(): Promise<User>;
//   Throws an AuthError("email-not-verified") usable to short-circuit
//   server actions. UI can catch and redirect to the check-email page.
```

## UI flows

### Post-signup landing (`/signup/check-email`)

- Accessible only to users with an active session but `emailVerifiedAt === null`.
- Shows the email we sent to (redacted: `j***@gmail.com`).
- Primary CTA: "I confirmed, take me in" — optimistically checks current user's `emailVerifiedAt`; if still null, shows a gentle "not yet."
- Secondary CTA: "Resend email" — calls `resendConfirmationEmail`, disables for 60 seconds, shows remaining resends for the hour.
- Footer link: "Wrong email? Sign out and try again."

### Confirmation callback (`/auth/confirm`)

- Route handler (not a page component — we want a server response with a redirect).
- Reads `token_hash` + `type` from query params, calls `supabase.auth.verifyOtp({ type, token_hash })`.
- On success: updates `User.emailVerifiedAt`, emits `user.email-verified` event, redirects to the role's default home (RBAC resolves).
- On failure (expired, invalid): redirects to `/auth/confirm-error` with an error code in the query. That page offers a "request a new link" CTA.

### Gated page pattern

Server components using `requireVerifiedEmail()`:

```tsx
const user = await requireVerifiedEmail();
//   throws AuthError("email-not-verified") → caught by the route's
//   error boundary, which redirects to /signup/check-email.
```

Opt-in per feature — not every page demands verification. Auth-critical paths (password change, billing if added) always do; browsing docs does not.

## Dependencies

- `auth-login-password`: owns the session that bears the `emailVerifiedAt` bit.
- `feature-flags`: `auth.require-verified-email` can toggle whether unverified users are soft-gated or hard-blocked. Default: soft-gate (they can read but not write).
- `users`: stores the bit.
- External: Supabase sends the email; we configure the template in their dashboard. Template pulls `{{ .ConfirmationURL }}` which we set to `{APP_URL}/auth/confirm?...`.

## Integration points

### Events emitted

```ts
export const EMAIL_VERIFIED = "user.email-verified";
export type EmailVerifiedEvent = {
  userId: string;
  email: string;
  at: Date;
};
```

The onboarding module (Phase 2) listens to gate the onboarding flow's first step. The referral module uses it as the conversion signal ("a referred user became a verified user").

### Invite bypass

When a user arrives via an invite token (`/invite/<token>`), their `emailVerifiedAt` is stamped immediately on signup — the invite itself proves email ownership. The signup flow detects the invite context and skips the check-email redirect. See `organization-management.md` for invite details.

## Edge cases

- **Email never arrives.** User presses resend, we bump the attempt counter. If they exhaust the limit, we show "We'll help you — contact support" with a pre-filled mailto. Hitting the limit is rare but Gmail / corporate filters do silently drop sometimes.
- **User changes email provider during signup.** They'd need to complete a "change email" flow, which doesn't exist in Phase 1. Workaround: sign out, delete account via support, re-sign up. Acceptable for Phase 1; build the change-email flow if support requests pile up.
- **Token expired.** Supabase default is 24h. We honor it, explain it, offer a resend. Nothing fancy.
- **Clicking the confirmation link on a different device.** Works — the token is bearer-authenticated; no session required. After verification, the route redirects to `/signin` with a "verified, please sign in" banner.

## Risks

- **Supabase email template drift.** The template in the Supabase dashboard isn't in git. Document its exact HTML + subject line in `auth/README.md` and include a screenshot. When someone changes it in prod, the doc reminds them to update the file.
- **Verification token leaks via referrer.** The `/auth/confirm` route should set `referrer-policy: no-referrer` to avoid leaking the token if the email client rewrites links. Standard practice.

## Success metrics

- Signup → verification rate > 70% within 24h.
- Resend rate < 15% (above that suggests inbox deliverability issues).
- Zero support tickets about "I verified but I'm still seeing the banner" (would indicate the sync isn't working).

## Implementation notes

- Always update `User.emailVerifiedAt` inside the `/auth/confirm` route handler, same transaction as issuing the session. Don't rely on the Supabase webhook as primary (latency-sensitive); the webhook is a belt-and-suspenders backstop for out-of-band verification.
- The email template link uses our `APP_URL` + `/auth/confirm`, not Supabase's default. Configure via Supabase dashboard.
- Cookies set from the confirm route must use the `@supabase/ssr` server helper, or Next won't send them with the redirect response.

## Out of scope

- Email deliverability monitoring dashboard (future ops work)
- Email change flow (covered in `users.md` as a future iteration)
- Phone / SMS verification (not applicable at launch)
- Second-factor email verification on sign-in from a new device (covered by trusted-devices.md instead)
