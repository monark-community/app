# Cross-cutting design rules

These hold across every rung ; implementation should never violate them.

### TOTP requirement survives the recovery flow

A user with TOTP enrolled who clicks the password-reset link in their email **still has to provide a TOTP code (or a recovery code)** before the new password takes effect. Skipping this turns email compromise into full account takeover and undoes the entire purpose of enabling 2FA.

Industry alignment : Google, GitHub, AWS all enforce this. A user who's lost both authenticator AND recovery codes goes to rung 2 (support).

Server-side gate lives in [`resetPasswordAction`](../../../services/web/src/app/auth/reset-password/actions.ts), mirroring the in-account [`changePasswordAction`](<../../../services/web/src/app/(authed)/account/actions.ts>) pattern : check `auth.totp.status`, require + verify code if enrolled.

### Recovery-code regen requires TOTP

A leaked recovery code shouldn't grant the attacker a path to mint a fresh batch and lock the legitimate user out of the recovery path entirely. Every regen path goes through `regenerateRecoveryCodes({ code })` ; the post-use modal's regen button reveals the OTP input rather than firing immediately. See [CHANGELOG](../../../CHANGELOG.md) "Recovery-code regen now requires TOTP everywhere" for the threat model.

### Out-of-band proof is the dead end

When the user lacks every in-band factor (password + authenticator + recovery codes), don't try to bridge the gap with another in-band mechanism. Force the user to a human operator with documented identity proof. This is intentional friction ; the worst failure mode is an automated "recovery" that lets an attacker bypass everything.

### Notification on every recovery event

The user should be told, by email, whenever a recovery factor was used : password reset (`auth.password-changed`), recovery code consumed (`totp.recovery-code-used`), trusted-device revoked (`trusted-device.added` for new devices, `trusted-devices.all-revoked` for the bulk path). The legitimate user noticing one of these emails when they didn't initiate the action is itself a recovery-time signal ; they go through rung 2 to take the account back.
