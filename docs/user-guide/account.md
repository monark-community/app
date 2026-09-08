# Signing in and your account

Everything that touches your personal account : the sign-up + sign-in flows, the security tools that protect it, your profile, your notification preferences, and the controls for deleting (or undeleting) it.

## Creating an account

Visit the sign-up page. You'll be asked for :

- **Email** : used as your sign-in identifier and as the address every notification goes to.
- **Password** : the strength meter scores it as you type. The app refuses passwords that include your email or your display name, that appear in known-breach lists, or that fall below the minimum strength score.
- **Display name** (optional) : the name shown next to your avatar across the app. You can leave it blank and add it later from your profile.

Submitting the form sends you a confirmation email. Click the link inside to verify the address ; if the link gives you trouble, the email also contains a 6-digit code you can paste into the confirmation form on the website. Once verified, you're signed in.

Already have an account ? Use the **Sign in** link on the sign-up page to land on the sign-in form instead.

## Signing in

If your deployment offers them, the social buttons come first : one click, nothing to remember. Otherwise sign in with your email address, which takes two steps.

![The sign-in page](../assets/signin-step-one.png)

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

## Forgot password

Click **Forgot password** on the sign-in form. Enter your email ; you'll receive a reset link. The reset page asks for your new password and re-checks the strength rules.

If you have two-factor enrollment, the reset gate also asks for a TOTP code (or a recovery code) before it lets the new password through. This closes the "if someone takes over your inbox they take over your account" gap. Lose both your authenticator and your recovery codes ? Out-of-band recovery is documented in [account-recovery.md](../technical-documentation/account-recovery.md).

## The account section (`/account/...`)

Your avatar in the top-right corner of any page opens the user-menu drawer. The "About you" links there take you into the account tabs :

| URL                      | What it holds                                                                     |
| ------------------------ | --------------------------------------------------------------------------------- |
| `/account/profile`       | Display name, bio, avatar, banner, language, theme.                               |
| `/account/security`      | Email, password, two-factor authentication, trusted devices.                      |
| `/account/notifications` | Per-category × per-channel preferences.                                           |
| `/account/api-keys`      | Personal API keys for the public API (see the [public API guide](public-api.md)). |
| `/account/danger`        | Schedule (or cancel) account deletion.                                            |

The account sidebar pinned to the left shows the same entries on wide viewports ; on narrow viewports it collapses to a horizontal strip above the content.

### Profile

- **Avatar + banner** : click either to upload a new image. Both are cropped + compressed automatically. Up to 5 MB per image. Once a banner or avatar is set, clicking re-opens a small menu with **Replace** and **Remove**.
- **Display name** : saves on blur. Empty values are allowed ; the app falls back to your email address everywhere a name would otherwise show.
- **Bio** : short free-form text, also saves on blur.
- **Language** : pick **English** or **Français**. The choice mirrors into your session cookie so the next page renders in the new language without a sign-out cycle. Emails the app sends you also follow this preference.
- **Theme** : Light / Dark / System. Saves immediately ; the page recolours without a reload.

While your account is in the deletion-grace window every field on this tab is locked read-only. A banner at the top of the section explains why and links to the danger tab where you can cancel.

### Security

The security tab gathers everything that protects sign-ins : email, password, TOTP, and the list of devices currently trusted to skip TOTP.

#### Change your email

Click **Change email**. A modal opens with two fields :

- **New email** : the address you want to switch to.
- **Current password** : to prove the change is intentional.

If you have TOTP enrolled, a second dialog asks for a 6-digit code before the request goes out.

The app sends a confirmation email to **both** your current and your new address. Click the link in either email _or_ paste the 6-digit code shown in either email back into the dialog. Once one side confirms, the dialog updates : "First side confirmed, now enter the code from {your other inbox}". When both sides have confirmed, the email rotates : you're signed out and bounced to the sign-in page with an "Email updated" banner ; sign back in with the new address.

You can keep the dialog open while waiting for the email ; it remembers your progress.

#### Change your password

Click **Change password**. A modal asks for :

- **Current password**
- **New password**
- **Confirm new password**

Same strength rules as sign-up. If you have TOTP enrolled, a second dialog asks for a 6-digit code. On success a toast confirms the change, and you receive a notification email (both an in-app entry and an outbound email) letting you know the password rotated. Inside the email, a clear "If this wasn't you" path explains how to lock the account down.

#### Two-factor authentication (TOTP)

The TOTP card surfaces three actions depending on whether you're already enrolled.

**Configure TOTP** : opens a 2-step wizard :

1. **Step 1 ; Scan the QR code.** Open your authenticator app (Google Authenticator, 1Password, Authy, …) and add a new account by scanning the QR. If the camera is unavailable, click **Can't scan?** to expand a copy-button-equipped codeblock with the secret string ; paste it into the app's manual-entry field.
2. **Step 2 ; Confirm with a code.** Enter the 6-digit code your authenticator currently shows. The button is **Back** if you want to re-check the QR.

Once confirmed, the modal switches to the **recovery codes** view : 10 single-use codes you should save somewhere outside the app (a password manager note works). The codes are your way back in if you lose access to the authenticator. There's a copy button at the top-right of the codeblock and an **I saved them** acknowledgement to close the dialog.

**Disable TOTP** : opens a single-step modal asking for a current 6-digit code. Confirming switches you back to password-only sign-ins and emails you a notification.

**Regenerate recovery codes** : also asks for a 6-digit code, then displays a fresh batch of 10. The previous codes stop working immediately.

After you sign in, the app may pop up a small **recovery codes reminder** dialog if your stored count drops below the safety threshold (or hits zero). Acknowledge or rotate from there ; there's no way to dismiss the "must regenerate" mode without rotating.

#### Trusted devices

Each browser you use to sign in records a row : a friendly label (the model, when the browser sends one), location (country, when the hosting platform supplies it), and last-seen timestamp. Two affordances :

- **Rename** : click the pencil next to a row to update its label. Useful when "K" appears for a Pixel because Chrome reduces the User-Agent string ; rename it "My phone" so you recognize it next time.
- **Revoke** : kicks the matching session. The current device is marked so you can't accidentally lock yourself out ; revoking it requires the **Revoke all** button instead.
- **Revoke all** : ends every session including yours. Useful as a panic button. You're signed out everywhere and have to sign back in (which will require TOTP if enrolled).

When TOTP is on, the trusted-device row remembers that the device cleared the TOTP gate. Future sign-ins from the same device skip the 6-digit prompt. New devices always get challenged.

### Notifications

Two parts : the **inbox drawer** (the bell icon at the top of the page) and the **preferences tab** (`/account/notifications`).

**Inbox drawer.** Click the bell. A drawer slides in from the right with :

- A badge on the bell itself showing the unread count (capped at "9+").
- Two filter tabs : **Unread** (default) and **All**.
- A **Mark all as read** button when there's something unread.
- The list of recent notifications. Each row has a category icon (key, laptop, shield, …), the subject, a short context line, the relative time, and a deep-link "Open" if the notification points anywhere.
- A small **⋯** button on each row opens a menu : **Mark as read** / **Mark as unread** / **Dismiss**.

The drawer is the canonical place to review notifications ; there's no separate `/inbox` page anymore.

**Preferences.** A toggle matrix : rows are **Security** and **Account** categories ; columns are **In-app** and **Email**. Click any cell to toggle. The Security × Email cell is locked on (those alerts protect your account ; you can't opt out). A help popover next to each category name explains what kinds of notifications fall under it.

The **Reset to defaults** button at the bottom drops every override and restores the system defaults. Useful if you've been over-tweaking.

### Danger zone

#### Request account deletion

Click **Request deletion**. A confirmation dialog explains the 14-day grace window, then schedules the deletion. You receive a notification email confirming the date the deletion completes ; the same email contains a link straight to this tab so you can cancel.

While the request is pending :

- Your sidebar collapses to **Profile** (read-only) + **Danger zone**.
- Every other page in the app redirects you back here.
- A banner on the profile tab explains why fields are locked.
- You can sign out and back in any time within the 14-day window ; you'll land directly on this tab.

#### Cancel a pending deletion

Inside the 14-day window, the danger zone shows **Cancel scheduled deletion**. Click it ; the request is voided, the limited-access shell lifts, and your full sidebar returns. You receive an in-app confirmation that the cancellation went through.

#### Permanent deletion (typed-email gate)

Click **Delete my account** to bring up a typed-email confirmation modal. You must type your email address verbatim before the **Delete** button enables. Confirming triggers the immediate hard delete ; there's no grace period for this path. You're signed out and your row is anonymized + Supabase-deleted in one shot.

This path is final ; the request-deletion grace flow is the path you want for almost every case.

## After-hours edge cases

- **You signed in mid-deletion** : the app routes you to `/account/danger` so cancellation is one click away.
- **Your password was reset by an admin** : check your inbox for the reset email and follow its link. Same flow as forgot-password from your side.
- **Your email was changed by you but the new inbox is unreachable** : open the email at your _current_ address and use the 6-digit code from there ; the dialog will accept either side.
- **You're an admin and you don't have TOTP enrolled** : you have 7 days to enroll before the app starts blocking admin routes ; an amber banner on `/account/security` counts down. Once you enroll, the banner disappears immediately. If you exceed the deadline, you can still reach `/account` to enroll, but every other route bounces back here with a toast saying "Admin access restricted".
