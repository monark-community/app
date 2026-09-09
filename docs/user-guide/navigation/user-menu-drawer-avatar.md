# User menu drawer (avatar)

Slides in from the right when you click your avatar. It's split into two tabs at
the top : **Notifications** (shown first) and **Account**.

**Notifications** tab : your in-app inbox (documented in detail under
[Notifications](../account/the-account-section-account/notifications.md)) :

- Two filter tabs (**Unread** / **All**) and a **Mark all as read** button when there are unread items.
- Scrollable list, each row with a category icon, the subject + body, the relative time, and a per-row **⋯** menu (Mark / Unmark / Dismiss).
- A **Load more** button once you've paged past the first batch.

The unread badge on the avatar refreshes every 15 seconds and on window focus.

**Account** tab, top to bottom :

- **Identity header** : your profile banner (or a brand-gradient fallback) fills the top, with your avatar and display name over it and the X close at the top-right.
- **Coming-soon cards** : placeholders reserved for community surfaces (rank, achievements) that aren't built yet ; they read "Coming soon".
- **Account links** : quick access to **Profile**, **Account & Security**, and **Notifications**.
- **Logout** at the bottom : one click signs you out and lands you on `/signin`.
