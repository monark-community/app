# Account recovery

How a user gets unstuck after losing their authenticator, password, or both. This document describes the _strategy_ and the industry context ; concrete implementation lives in [`packages/auth`](../../packages/auth) and the auth-related routes under [`services/web/src/app`](../../services/web/src/app).

## The recovery ladder

Recovery is a ladder, not a single flow. Each lost factor pushes the user one rung up. The starter ships rungs 1 + 2 ; rungs 3+ are deferred until there's user volume that justifies the infra.

### 1. Recovery codes (shipped)

Generated at TOTP enrollment, displayed once in [`<TotpSection>`](<../../services/web/src/app/(authed)/account/totp-section.tsx>) inside an amber-tinted card with a copy button. The user is expected to save them somewhere recoverable (password manager, printed copy in a desk drawer, etc.). Each is a 14-character `XXXX-XXXX-XXXX` string usable exactly once ; consumed codes are stamped `usedAt: now` server-side.

**Where they're spent**: the `/signin/totp` page has a "use recovery code" mode that takes the 14-char code and bypasses the TOTP challenge. Implementation in [`signin/totp/totp-form.tsx`](<../../services/web/src/app/(anon)/signin/totp/totp-form.tsx>).

**When they run low**: the [`<RecoveryCodeReminder>`](../../services/web/src/components/recovery-code-reminder.tsx) modal pops on next sign-in when the remaining count drops below 3 (suggest regen) or hits 0 (block until regen). Regen always requires a fresh TOTP code ; see the [reasoning in CHANGELOG](../../CHANGELOG.md) under "Recovery-code regen now requires TOTP everywhere".

**When the user lost their codes too**: rung 5 (out-of-band support).

### 2. Out-of-band support contact (deferred)

A documented `support@<your-domain>` address + a small `/account/recovery-help` page that explains the manual ID-verification process. Zero infrastructure. The support inbox isn't automated ; the operator validates identity (government ID, billing history, video call, etc.) and manually performs the recovery via the Supabase admin API.

**Status**: not yet built. Tracked in [`docs/todo/backlog.md`](../todo/backlog.md) under "Account recovery". Until it lands, the de-facto recovery for "lost everything" is "create a new account" which is bad ; the help page is a small but real gap.

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

## Cross-cutting design rules

These hold across every rung ; implementation should never violate them.

### TOTP requirement survives the recovery flow

A user with TOTP enrolled who clicks the password-reset link in their email **still has to provide a TOTP code (or a recovery code)** before the new password takes effect. Skipping this turns email compromise into full account takeover and undoes the entire purpose of enabling 2FA.

Industry alignment : Google, GitHub, AWS all enforce this. A user who's lost both authenticator AND recovery codes goes to rung 2 (support).

Server-side gate lives in [`resetPasswordAction`](../../services/web/src/app/auth/reset-password/actions.ts), mirroring the in-account [`changePasswordAction`](<../../services/web/src/app/(authed)/account/actions.ts>) pattern : check `auth.totp.status`, require + verify code if enrolled.

### Recovery-code regen requires TOTP

A leaked recovery code shouldn't grant the attacker a path to mint a fresh batch and lock the legitimate user out of the recovery path entirely. Every regen path goes through `regenerateRecoveryCodes({ code })` ; the post-use modal's regen button reveals the OTP input rather than firing immediately. See [CHANGELOG](../../CHANGELOG.md) "Recovery-code regen now requires TOTP everywhere" for the threat model.

### Out-of-band proof is the dead end

When the user lacks every in-band factor (password + authenticator + recovery codes), don't try to bridge the gap with another in-band mechanism. Force the user to a human operator with documented identity proof. This is intentional friction ; the worst failure mode is an automated "recovery" that lets an attacker bypass everything.

### Notification on every recovery event

The user should be told, by email, whenever a recovery factor was used : password reset (`auth.password-changed`), recovery code consumed (`totp.recovery-code-used`), trusted-device revoked (`trusted-device.added` for new devices, `trusted-devices.all-revoked` for the bulk path). The legitimate user noticing one of these emails when they didn't initiate the action is itself a recovery-time signal ; they go through rung 2 to take the account back.

## What the user sees today

| Loss                           | Recovery path                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Password only                  | `/forgot-password` → email link / OTP → `/auth/reset-password` → set new password (TOTP gate runs if enrolled) |
| Authenticator only             | `/signin` → password → `/signin/totp` → "use recovery code" mode → enter 14-char code                          |
| Authenticator + recovery codes | Out-of-band support (rung 2) ; not yet implemented                                                             |
| Email + everything             | Out-of-band support ; not yet implemented                                                                      |

## Adding a new recovery factor

When you build rung 2 / 3 / 4 :

1. **Add a CHANGELOG entry** describing the threat model the new factor closes.
2. **Document the rung above** : when this factor is also lost, what's the next escape hatch ?
3. **Match the notification pattern** : every use of the new factor fires an email so the legitimate user can detect misuse.
4. **Update this document's "What the user sees today" table** so the recovery flow stays discoverable.
