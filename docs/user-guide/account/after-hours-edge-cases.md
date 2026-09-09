# After-hours edge cases

- **You signed in mid-deletion** : the app routes you to `/account/danger` so cancellation is one click away.
- **Your password was reset by an admin** : check your inbox for the reset email and follow its link. Same flow as forgot-password from your side.
- **Your email was changed by you but the new inbox is unreachable** : open the email at your _current_ address and use the 6-digit code from there ; the dialog will accept either side.
- **You're an admin and you don't have TOTP enrolled** : you have 7 days to enroll before the app starts blocking admin routes ; an amber banner on `/account/security` counts down. Once you enroll, the banner disappears immediately. If you exceed the deadline, you can still reach `/account` to enroll, but every other route bounces back here with a toast saying "Admin access restricted".
