---
type: how-to
---

# Turn on two-factor authentication

Ask for a code from an authenticator app (Google Authenticator, 1Password, Authy and so on) when you sign in on a new device, so a stolen password isn't enough.

1. Click your avatar at the top right, open the **Account** tab, and choose **Account & Security**.
2. Under **Two-factor authentication**, click **Configure TOTP**.
3. In your authenticator app, add an account by scanning the QR code. If you can't scan it, click **Can't scan? Show the secret** and type the secret into the app instead. Click **Continue**.
4. Enter the 6-digit code the app shows and click **Confirm**.
5. Save the 10 recovery codes somewhere outside the app, such as a password manager, then click **I saved them**.

From now on, a device you haven't used before asks for a code after your password.

## Get new recovery codes

Each recovery code works once. After you use one, the app reminds you how many are left and offers fresh ones when you run low.

1. Click **Regenerate recovery codes**.
2. Enter your current 6-digit code. Your old codes stop working.
3. Save the new codes and click **I saved them**.

## Turn it off

Click **Disable TOTP** and enter your current 6-digit code. You get an email confirming the change.

Good to know:

- If you're an admin, two-factor is required. You have 7 days to set it up; after that, only your account settings open until you do.
- Changing your email or password asks for a code once two-factor is on.

Next: [Change your email or password](change-your-email-or-password.md)
