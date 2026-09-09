# Danger zone

## Request account deletion

Click **Request deletion**. A confirmation dialog explains the 14-day grace window, then schedules the deletion. You receive a notification email confirming the date the deletion completes ; the same email contains a link straight to this tab so you can cancel.

While the request is pending :

- Your sidebar collapses to **Profile** (read-only) + **Danger zone**.
- Every other page in the app redirects you back here.
- A banner on the profile tab explains why fields are locked.
- You can sign out and back in any time within the 14-day window ; you'll land directly on this tab.

## Cancel a pending deletion

Inside the 14-day window, the danger zone shows **Cancel scheduled deletion**. Click it ; the request is voided, the limited-access shell lifts, and your full sidebar returns. You receive an in-app confirmation that the cancellation went through.

## Permanent deletion (typed-email gate)

Click **Delete my account** to bring up a typed-email confirmation modal. You must type your email address verbatim before the **Delete** button enables. Confirming triggers the immediate hard delete ; there's no grace period for this path. You're signed out and your row is anonymized + Supabase-deleted in one shot.

This path is final ; the request-deletion grace flow is the path you want for almost every case.
