# Notifications

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
