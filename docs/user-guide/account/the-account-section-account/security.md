# Security

The security tab gathers everything that protects sign-ins : email, password, TOTP, and the list of devices currently trusted to skip TOTP.

## Change your email

Click **Change email**. A modal opens with two fields :

- **New email** : the address you want to switch to.
- **Current password** : to prove the change is intentional.

If you have TOTP enrolled, a second dialog asks for a 6-digit code before the request goes out.

The app sends a confirmation email to **both** your current and your new address. Click the link in either email _or_ paste the 6-digit code shown in either email back into the dialog. Once one side confirms, the dialog updates : "First side confirmed, now enter the code from {your other inbox}". When both sides have confirmed, the email rotates : you're signed out and bounced to the sign-in page with an "Email updated" banner ; sign back in with the new address.

You can keep the dialog open while waiting for the email ; it remembers your progress.

## Change your password

Click **Change password**. A modal asks for :

- **Current password**
- **New password**
- **Confirm new password**

Same strength rules as sign-up. If you have TOTP enrolled, a second dialog asks for a 6-digit code. On success a toast confirms the change, and you receive a notification email (both an in-app entry and an outbound email) letting you know the password rotated. Inside the email, a clear "If this wasn't you" path explains how to lock the account down.

## Two-factor authentication (TOTP)

The TOTP card surfaces three actions depending on whether you're already enrolled.

**Configure TOTP** : opens a 2-step wizard :

1. **Step 1 ; Scan the QR code.** Open your authenticator app (Google Authenticator, 1Password, Authy, …) and add a new account by scanning the QR. If the camera is unavailable, click **Can't scan?** to expand a copy-button-equipped codeblock with the secret string ; paste it into the app's manual-entry field.
2. **Step 2 ; Confirm with a code.** Enter the 6-digit code your authenticator currently shows. The button is **Back** if you want to re-check the QR.

Once confirmed, the modal switches to the **recovery codes** view : 10 single-use codes you should save somewhere outside the app (a password manager note works). The codes are your way back in if you lose access to the authenticator. There's a copy button at the top-right of the codeblock and an **I saved them** acknowledgement to close the dialog.

**Disable TOTP** : opens a single-step modal asking for a current 6-digit code. Confirming switches you back to password-only sign-ins and emails you a notification.

**Regenerate recovery codes** : also asks for a 6-digit code, then displays a fresh batch of 10. The previous codes stop working immediately.

After you sign in, the app may pop up a small **recovery codes reminder** dialog if your stored count drops below the safety threshold (or hits zero). Acknowledge or rotate from there ; there's no way to dismiss the "must regenerate" mode without rotating.

## Trusted devices

Each browser you use to sign in records a row : a friendly label (the model, when the browser sends one), location (country, when the hosting platform supplies it), and last-seen timestamp. Two affordances :

- **Rename** : click the pencil next to a row to update its label. Useful when "K" appears for a Pixel because Chrome reduces the User-Agent string ; rename it "My phone" so you recognize it next time.
- **Revoke** : kicks the matching session. The current device is marked so you can't accidentally lock yourself out ; revoking it requires the **Revoke all** button instead.
- **Revoke all** : ends every session including yours. Useful as a panic button. You're signed out everywhere and have to sign back in (which will require TOTP if enrolled).

When TOTP is on, the trusted-device row remembers that the device cleared the TOTP gate. Future sign-ins from the same device skip the 6-digit prompt. New devices always get challenged.
