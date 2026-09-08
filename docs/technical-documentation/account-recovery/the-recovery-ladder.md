# The recovery ladder

Recovery is a ladder, not a single flow. Each lost factor pushes the user one rung up. The starter ships rungs 1 + 2 ; rungs 3+ are deferred until there's user volume that justifies the infra.

### 1. Recovery codes (shipped)

Generated at TOTP enrollment, displayed once in [`<TotpSection>`](<../../../services/web/src/app/(authed)/account/totp-section.tsx>) inside an amber-tinted card with a copy button. The user is expected to save them somewhere recoverable (password manager, printed copy in a desk drawer, etc.). Each is a 14-character `XXXX-XXXX-XXXX` string usable exactly once ; consumed codes are stamped `usedAt: now` server-side.

**Where they're spent**: the `/signin/totp` page has a "use recovery code" mode that takes the 14-char code and bypasses the TOTP challenge. Implementation in [`signin/totp/totp-form.tsx`](<../../../services/web/src/app/(anon)/signin/totp/totp-form.tsx>).

**When they run low**: the [`<RecoveryCodeReminder>`](../../../services/web/src/components/recovery-code-reminder.tsx) modal pops on next sign-in when the remaining count drops below 3 (suggest regen) or hits 0 (block until regen). Regen always requires a fresh TOTP code ; see the [reasoning in CHANGELOG](../../../CHANGELOG.md) under "Recovery-code regen now requires TOTP everywhere".

**When the user lost their codes too**: rung 5 (out-of-band support).

### 2. Out-of-band support contact (deferred)

A documented `support@<your-domain>` address + a small `/account/recovery-help` page that explains the manual ID-verification process. Zero infrastructure. The support inbox isn't automated ; the operator validates identity (government ID, billing history, video call, etc.) and manually performs the recovery via the Supabase admin API.

**Status**: not yet built. Tracked in [`docs/todo/backlog.md`](../../todo/backlog.md) under "Account recovery". Until it lands, the de-facto recovery for "lost everything" is "create a new account" which is bad ; the help page is a small but real gap.

### 3. Backup email (deferred)

A secondary email address registered ahead of time. Recovery links + OTPs are sent to all configured addresses simultaneously. Closes the "primary inbox compromised" failure mode (SIM swap → carrier-side reset → SMS code → email password reset).

**Implementation cost**: a `BackupEmail` table, a verification flow per address (the same `email_change` template flow Supabase already runs), and a UI for managing the list. Probably one PR.

**Status**: not built. Tracked in the backlog.

### 4. Trusted-device attestation / passkeys (future)

WebAuthn passkeys synced through iCloud Keychain / Google Password Manager / 1Password let the user's _other_ devices act as the second factor. Apple's "Trusted Devices" + Microsoft's account-recovery codes are variants of the same idea. Increasingly the dominant pattern across the industry ; gradually replaces TOTP entirely.

**Status**: not yet planned. The shadcn registry has `passkeys-input` ; integrating with `@supabase/ssr`'s WebAuthn helpers when they ship is the natural path. Probably v3 of the auth stack, when a meaningful share of users actually have passkeys saved on multiple devices.

### 5. Time-delayed self-service recovery (deferred)

User submits a recovery request, the account freezes for 7–30 days, every active session gets a "recovery pending ; cancel if it's not you" email, and after the window elapses uncontested the password is reset. The delay IS the security feature. Apple has it with a multi-week window. Not appropriate for early-stage products (most users won't tolerate the wait) ; appropriate for established products with high-value accounts.

**Status**: not planned.
