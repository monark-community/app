# Auth — TOTP (Time-based One-Time Password) / 2FA

## Context

Second-factor authentication via a TOTP authenticator app (Google Authenticator, 1Password, Authy, etc.). The starter brief lists it explicitly. For admins and executives, it should be mandatory; for other roles, it's opt-in but strongly encouraged. Combined with trusted-devices, TOTP adds real protection against stolen credentials without becoming a daily friction point.

## Goals

- Users can enable TOTP from `/account/security/totp`: generate a secret, display QR code, user types a code to confirm, we save the secret encrypted at rest.
- On sign-in, if TOTP is enabled on the user AND the device is not recognized (per `auth-trusted-devices.md`), require a 6-digit code before issuing the full session.
- Recovery codes (10 one-time codes) generated at enrollment; user acknowledges saving them before TOTP is considered "active."
- Disabling TOTP requires re-entering the password + a current TOTP code.
- Admin role: enforce TOTP enrollment within 7 days of first sign-in (via onboarding gate).

## Non-goals

- No SMS / email as a factor. SIM swap is real; we don't want false confidence.
- No push-based 2FA (Duo, Okta, etc.). Extra cost and complexity for our scale.
- No WebAuthn / passkeys at Phase 1. Distinct future work; deliberately not in scope here.
- No hardware-key-only mode.

## User stories

- **As a security-conscious user**, I can enable TOTP in a few minutes using my authenticator app of choice.
- **As an admin**, TOTP is enforced — the app blocks me from sensitive routes until I enroll.
- **As a user who lost my phone**, I can use one of my recovery codes to get back in and re-enroll.
- **As a user signing in from my usual laptop**, I don't see a TOTP prompt every time — the trusted device skips it.

## Data model

```prisma
model TotpSecret {
  id            String   @id @default(cuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Encrypted base32 secret; key management below
  secretCipher  Bytes
  secretIv      Bytes

  enrolledAt    DateTime @default(now())
  // If null, user started enrollment but hasn't verified the first code
  activatedAt   DateTime?

  // One-time recovery codes (hashed — bcrypt or similar; not retrievable)
  recoveryCodes RecoveryCode[]
}

model RecoveryCode {
  id           String   @id @default(cuid())
  totpSecretId String
  totpSecret   TotpSecret @relation(fields: [totpSecretId], references: [id], onDelete: Cascade)

  codeHash     String                     // bcrypt of the 10-char code
  usedAt       DateTime?

  @@index([totpSecretId])
}
```

### Encryption at rest

TOTP secrets are encrypted with AES-256-GCM. The key is stored in the Supabase Vault (or an env var rotated via ops) and never in the DB. Code implementing enc/dec lives in `packages/auth/src/server/crypto.ts` and is used only by the TOTP module.

## API surface

```ts
// packages/auth/src/server/procedures/totp.ts

// Start enrollment — returns a secret + otpauth URL for the QR, but
// nothing is "active" until user confirms a code.
"use server"
export async function beginTotpEnrollment(): Promise<{
  secret: string                // base32; displayed to user as a fallback
  qrSvg: string                 // otpauth URL rendered as themed SVG (currentColor + transparent bg)
}>

// Verify the first code; if valid, activate + issue recovery codes.
"use server"
export async function confirmTotpEnrollment(code: string): Promise<{
  recoveryCodes: string[]       // shown once; user acknowledges saving
}>

"use server"
export async function verifyTotpCode(code: string): Promise<boolean>
//   Called during sign-in after password verification. Consumes the code
//   (rejects replays within the current 30-sec window).

"use server"
export async function verifyRecoveryCode(code: string): Promise<boolean>
//   Consumes one recovery code. Hashed comparison; marks usedAt.

"use server"
export async function disableTotp(password: string, code: string): Promise<void>
//   Requires both factors to confirm intent. Deletes the TotpSecret.

"use server"
export async function regenerateRecoveryCodes(code: string): Promise<string[]>
//   Current TOTP required. Invalidates old recovery codes.
```

Read interface:

```ts
// packages/auth/src/server/index.ts
export async function isTotpEnabled(userId: string): Promise<boolean>
export async function requiresTotpChallenge(
  userId: string,
  trustedDeviceId?: string
): Promise<boolean>
```

## UI flows

### Enrollment (`/account/security/totp`)

1. "Enable two-factor authentication" button → calls `beginTotpEnrollment`.
2. Modal shows QR + the raw secret (for users who can't scan). "Waiting for first code" state.
3. User enters 6-digit code → `confirmTotpEnrollment`.
4. Recovery codes displayed. Require a checkbox: "I've saved these somewhere safe."
5. "Done" returns to the security page; TOTP now shows "Enabled" with options to regenerate codes or disable.

### Sign-in with TOTP

1. Password step succeeds → server action returns `{ status: "totp-required", partialSessionId }`.
2. Client routes to `/signin/totp`.
3. User enters 6-digit code (or "Use a recovery code" link). Verified via `verifyTotpCode` / `verifyRecoveryCode`.
4. On success, full session issued; redirect to role home.

### Admin enforcement (see `rbac-system.md`)

- Admins who haven't enrolled are soft-walled: every route in `/admin/**` redirects to `/account/security/totp?enforced=1` with a banner "Two-factor required for admin access."
- After 7 days, hard wall — all routes redirect, not just admin ones. Concrete timer handled by a cron that emits `admin.totp-enforcement.overdue` events; the routing guard reads that state.

## Dependencies

- `auth-login-password`: TOTP verification is inserted between password and session issuance.
- `auth-trusted-devices`: a recognized device can skip TOTP per policy. The policy is a feature flag (`auth.totp-trust-devices`, default on).
- `feature-flags`: `auth.totp-required-admin`, `auth.totp-trust-devices`.
- `rbac`: determines whether a user must enroll based on role.
- External: `otplib` or `@otplib/core` for TOTP generation/validation. `qrcode` for the PNG data-URL.

## Integration points

### Events

```ts
export const TOTP_ENABLED = "totp.enabled"
export const TOTP_DISABLED = "totp.disabled"
export const TOTP_RECOVERY_CODE_USED = "totp.recovery-code-used"
```

### Sign-in flow contract

Sign-in returns one of:

```ts
| { status: "ok" }                                        // session issued
| { status: "totp-required"; partialSessionId: string }   // bounce to /signin/totp
| { status: "email-not-verified" }
| { status: "invalid-credentials" }
```

## Edge cases

- **Clock skew.** TOTP tolerates ±1 window (30 sec) on verify. Beyond that, validate code fails — advise the user to check device time in the error message.
- **QR scan fails in dark mode.** Render the QR on a white background regardless of theme.
- **Recovery codes lost AND phone lost.** User must contact admin for manual reset (admin endpoint: `resetTotpForUser(userId)`). Logged loudly with `account.security-override` event. Document this escape hatch in support runbooks.
- **User enrolls TOTP, navigates away before confirming.** `activatedAt` stays null; next visit to the page shows "enrollment in progress" with resume/discard options. Cron cleans up >24h-old unactivated enrollments.
- **User changes password while TOTP is active.** No change to TOTP — separate concerns.

## Risks

- **Secret exfiltration.** If the DB is dumped, encrypted secrets are useless without the encryption key. Key compromise is catastrophic; document key rotation procedure and store the key in a managed secret store, not in raw env vars on the developer machine.
- **Recovery-code display UX failure.** Users paste codes into Slack, screenshot, email. Nothing we can do technically; warn strongly at display time and in the email that follows enrollment.
- **Admin hard-wall frustration.** New admins blocked before they can do useful work if enrollment UX is confusing. Mitigate by making enrollment the first step of admin onboarding (Phase 2 `user-onboarding.md`).

## Success metrics

- % of admins enrolled within 7 days of first sign-in — target 100% (any gap is a process bug).
- % of developers + ambassadors enrolled at 90 days — track; aspirational target 40%+.
- Recovery-code usage rate (one-time events; should be rare).
- TOTP-related support tickets per month (< 5 at steady state is fine).

## Implementation notes

- The `otplib` `authenticator` module works for both generation and validation. Use `authenticator.keyuri(email, issuer, secret)` for the otpauth URL.
- `qrcode.toDataURL(otpauthUrl, { width: 240, margin: 1 })` produces a clean PNG.
- Recovery codes: 10 codes, format `XXXX-XXXX-XXXX` (12 hex-ish chars plus dashes). Generate with crypto.randomBytes, hex-encode, slice.
- Hash recovery codes with bcrypt at cost 10 — same as how passwords are handled on-insert (Supabase does this for passwords; we do it for our codes).
- Rate limit `verifyTotpCode` attempts: 5/minute per user; on exceed, require password re-entry.

## Out of scope

- WebAuthn / passkeys (future)
- Hardware security key support (future; related to WebAuthn)
- Push-based second factor (not planned)
- Risk-based MFA (adaptive — "we didn't require TOTP but now we do because you moved countries") — possibly in Phase 3+
