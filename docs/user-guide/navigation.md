# Navigating the app

The chrome that wraps every authenticated page : the navigation rail, the app bar, and the drawers they open. None of this requires admin access ; it's the same for every signed-in user (destinations you can't reach are simply hidden).

## The navigation rail

On a desktop-width screen a slim vertical **navigation rail** is pinned to the left edge of every authenticated page. Top to bottom :

1. **Brand mark** at the top : clicking it always goes to `/` (home).
2. **Destination icons** : one per top-level product surface you have access to (Calendar, Kanban, Wiki, Automation, Data). Each is icon-only with a tooltip on hover ; the icon for the section you're in is highlighted. A destination only appears when its feature is enabled for you, so the rail shows exactly what you can reach.
3. **Admin pin** at the bottom : a shield icon, only visible when you hold an admin or sysadmin role. Clicking it enters the admin section.

On narrow (phone / small tablet) viewports the rail is hidden ; tapping the **brand mark** in the app bar (it carries a small menu badge) opens the same destinations as a slide-in drawer from the left. The drawer lists **Home** first, then the module destinations, with the admin pin as a filled button at the bottom. Close it with the X, the dimmed overlay, or Escape.

## The app bar

A sticky bar across the top of every authenticated page (`h-14`). On desktop the rail owns the brand + navigation, so the app bar carries only the breadcrumb on the left and a cluster of controls on the right ; on mobile the left shows the merged **brand + menu** mark (it opens the drawer) instead.

Right-side cluster, left to right :

- **Assistant** (✨) : opens the AI assistant panel (where enabled) ; also **⌘J** / **Ctrl-J**. See [The assistant](assistant.md).
- **Search** (magnifier) : opens the global command palette. You can also open it any time with **⌘K** (macOS) / **Ctrl-K** (Windows/Linux).
- **Avatar** : opens the user menu drawer (right side). Your **notifications now live here** (a badge on the avatar shows the unread count).

## Breadcrumb

The breadcrumb auto-generates from the page URL ; pages don't register anything. For `/admin/organizations/abc123` you see `Admin / Organizations / Acme`, where "Acme" is the live display name resolved from the org id.

- **Long paths collapse.** More than three segments shows the first two crumbs, an ellipsis, and the current page.
- **Some segments don't link.** `Admin` is one : the `/admin` URL just redirects to the first tab, so it renders as muted text rather than a link. In single-tenant deploys the `Organizations` crumb behaves the same way (its page redirects to the singleton's edit page).
- **Dynamic ids resolve to names.** When a URL segment is an entity id (a user, org, role, record), the breadcrumb fetches its display name and shows that instead of the raw id ; until the lookup resolves you'll briefly see the id.

## Global search (⌘K)

The command palette searches across the app ; jump to a section, find a user or organization, an automation, a data record, and so on. Open it from the app-bar search icon or with **⌘K** / **Ctrl-K**, type to filter, arrow-key to a result, Enter to go. Escape closes it.

## Secondary navigation

Sections that have sub-pages (your account, the admin area, a data model) show a **secondary navigation** for their own tabs : a rail beside the content on wide screens, collapsing to a horizontal tab strip on narrower ones. For example `/account` shows Profile / Account & Security / Notifications / API keys / Danger zone ; the admin area shows its tabs the same way.

## User menu drawer (avatar)

Slides in from the right when you click your avatar. It's split into two tabs at
the top : **Notifications** (shown first) and **Account**.

**Notifications** tab : your in-app inbox (documented in detail under
[Notifications](account.md#notifications)) :

- Two filter tabs (**Unread** / **All**) and a **Mark all as read** button when there are unread items.
- Scrollable list, each row with a category icon, the subject + body, the relative time, and a per-row **⋯** menu (Mark / Unmark / Dismiss).
- A **Load more** button once you've paged past the first batch.

The unread badge on the avatar refreshes every 15 seconds and on window focus.

**Account** tab, top to bottom :

- **Identity header** : your profile banner (or a brand-gradient fallback) fills the top, with your avatar and display name over it and the X close at the top-right.
- **Coming-soon cards** : placeholders reserved for community surfaces (rank, achievements) that aren't built yet ; they read "Coming soon".
- **Account links** : quick access to **Profile**, **Account & Security**, and **Notifications**.
- **Logout** at the bottom : one click signs you out and lands you on `/signin`.

## Routes worth knowing

You almost never type these (every link in the chrome takes you there) but they're stable and bookmarkable :

- `/` ; home.
- `/account` → `/account/profile` ; profile fields ; `/account/security` (email, password, TOTP, trusted devices), `/account/notifications` (preferences), `/account/api-keys` (personal API keys), `/account/danger` (schedule / cancel deletion).
- `/calendar` ; calendars and events (Day / Week / Month / Agenda).
- `/kanban` ; boards, columns, cards.
- `/automation` ; automation flows (node editor + run history).
- `/data/models/<modelKey>` ; records for an admin-defined Data Model.
- `/admin` ; the admin section ; redirects to its first tab. Tabs: `/admin/organizations`, `/admin/users`, `/admin/rbac`, `/admin/webhooks`, `/admin/data-models`, `/admin/files`, `/admin/secrets`, `/admin/service-accounts`.
- `/signin`, `/signup`, `/forgot-password` ; pre-auth surfaces.

Destinations behind a feature flag (Kanban, Automation, and the per-model Data surfaces) only appear (and only resolve) when the flag is on for you.

## Keyboard + touch

- **⌘K / Ctrl-K** opens global search ; **Escape** closes any open drawer, dialog, or the palette.
- **Tab** moves through controls (the focus ring is brand-orange) ; **Enter** activates the focused button or link.
- Buttons and links are 36 px or larger so they hit cleanly on touch ; the notifications filter tabs follow tablist semantics (arrow keys move between Unread / All).
