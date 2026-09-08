# `@monark/auth`

Sign-up, sign-in, password rules, TOTP, trusted devices, session lifecycle. The biggest package.

- **Have** : `accept-language.test.ts`, `account-lifecycle.test.ts`, `crypto.test.ts`, `password-rules.test.ts`, `signup-schema.test.ts`, `totp-rate-limit.test.ts`, `trusted-devices-helpers.test.ts`. Strong start.
- **Add** :
  - `totp.test.ts` ; enrolment generates a base32 secret + QR ; confirmation accepts the current code, rejects the previous code, rejects a future one ; recovery codes are 10 unique tokens, each consumable once.
  - `trusted-devices.test.ts` (integration) ; recognising a device upserts the row + emits `trusted-device.added` exactly once on first-seen ; the cookie validates against live rows ; `revokeAll` flips every row's `revokedAt`.
  - `signup.test.ts` (integration) ; full signup → email verification → row state transition. Stubs the Supabase Auth admin client.
  - `email-verification.test.ts` ; OTP path accepts the 6-digit code from the email + idempotently no-ops on a second attempt.
- **Coverage target** : 80 %.
