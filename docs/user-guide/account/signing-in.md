# Signing in

If your deployment offers them, the social buttons come first : one click, nothing to remember. Otherwise sign in with your email address, which takes two steps.

![The sign-in page](../../assets/signin-step-one.png)

**Step one asks only for your email.** **Step two asks for your password**, with the address you entered still on screen and a **Change** button in case it was the wrong one. Your password manager still works : both steps are a single form, so it sees the address and the password as one credential.

Reaching step two says nothing about whether an account exists for that address. An unknown address fails the same way it always did, after the password is submitted.

Three things that can happen after you submit :

1. **You're signed in.** You land on the home page.
2. **You're enrolled in two-factor.** A 6-digit code form appears. Enter the current code from your authenticator app and you're in. If you've lost the authenticator, click "Use a recovery code" ; each code works once.
3. **Your account is in deletion grace.** You land directly on the **Danger zone** tab so you can cancel the scheduled deletion if that wasn't your intent.

Banners on the sign-in page :

- **Email updated** : shown after the email-change flow logs you out. Sign in with the new address.
- **Password updated** : shown after a password reset. Sign in with the new password.
- **Deletion scheduled** : shown after you request deletion ; lists the date the deletion completes, with one click back into your account if you want to cancel.
