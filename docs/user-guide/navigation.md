# Navigating the app

The chrome that wraps every authenticated page : the top bar, the side drawers, and the URL hints they leave behind. None of this requires admin access — it's the same for every signed-in user.

## The top bar

A sticky, full-width bar at the top of every authenticated page. From left to right :

1. **Hamburger** — opens the primary navigation drawer (left side).
2. **Logo** — clicks always go to `/` (the home page).
3. **Breadcrumb** — shows where you are in the app, derived from the URL.
4. **Apps launcher** (3-dot grid icon) — opens the apps drawer (right side).
5. **Notifications bell** — opens the notifications drawer (right side). A small badge shows unread count when there is one.
6. **Avatar** — opens the user menu drawer (right side).

On narrow viewports the breadcrumb shows only the current segment so it doesn't crowd the right-side icons.

## Breadcrumb

The breadcrumb auto-generates from the page URL — pages don't have to register anything. For `/admin/organizations/abc123` you see `Admin / Organizations / Acme`, where "Acme" is the live display name resolved from the org id.

A few rules worth knowing :

- **Long paths collapse.** Anything longer than three segments shows the first two crumbs, an ellipsis, and the current page. So `/admin/organizations/abc/edit/settings` reads `Admin / Organizations / … / Settings`.
- **Some segments don't link.** `Admin` is one example : the `/admin` URL is just a redirect to the first sidebar tab, so clicking it would loop you through. The breadcrumb renders these as muted text instead of links so the click doesn't waste a hop. In single-tenant deploys the `Organizations` crumb behaves the same way (its page redirects to the singleton's edit page).
- **Dynamic ids resolve to names.** When a URL segment is an entity id (a user, an org, a role), the breadcrumb fetches the entity's display name and shows that instead of the raw id. Until the lookup resolves, you'll briefly see the id.

## Primary navigation drawer (hamburger)

Slides in from the left when you click the hamburger icon. Contents :

- **Brand block** at the top — logo + the app's name, doubles as a "go home" link.
- **Module list** — the top-level features the operator has registered. In the Phase-1 starter the list is empty and the drawer reads "No module registered" ; phase-2 adds Monark-specific modules (community, voting, contributions, …) here.
- **Admin pin** at the bottom — only visible when you have an admin or sysadmin role. Filled-orange button styled to stand out from the modules above. Clicking it lands you in the admin section.

Closing the drawer : click the X at the top right, click the dimmed overlay outside, or press Escape.

## Apps launcher (3-dot grid)

A right-side drawer listing every Monark product surface, with one card per product. Each card has :

- An icon and the product name (e.g. **Monark Core**).
- A tagline one line below.
- A **Current** pill on the card matching the surface you're already inside.
- An external-link glyph on cards for products hosted elsewhere — clicking those opens the product in a new tab so your session here stays put.

After the registered cards, an empty dashed-border slot reads "No app registered". This is intentional ; it tells operators that adding more Monark apps is a known affordance, slotting in here as new products come online.

## Notifications drawer (bell)

Slides in from the right when you click the bell. Documented in detail under [Notifications](account.md#notifications), but the chrome :

- Header bar with the title, two filter tabs (**Unread** / **All**), and a **Mark all as read** button when there are unread items.
- Scrollable list of notifications, each with a category icon (key for password events, laptop for new sign-ins, shield variants for TOTP, etc.), the subject + body, the relative time, and a per-row **⋯** menu with Mark / Unmark / Dismiss.
- A **Load more** button at the bottom of the list once you've paged past the first batch.

The bell badge shows your unread count. It refreshes every minute and on window focus.

## User menu drawer (avatar)

Slides in from the right when you click your avatar. Top-down :

- **Banner-backed identity header.** Your profile banner image (or a brand-gradient fallback) fills the top region of the drawer ; the bottom half fades into the drawer's background. Your avatar sits centred on the banner's bottom edge with your display name beside it. The X close affordance lives at the top-right of the banner.
- **Phase-2 placeholder cards.** Three cards (two side-by-side + one wider below) reserved for the Monark-specific surfaces (rank, achievements) shipping in phase-2. They currently read "Coming soon".
- **About you.** Three quick-access links to the account section : **Profile**, **Account & Security**, **Notifications**.
- **Logout button** anchored at the bottom of the drawer. Single click signs you out and lands you on `/signin`.

## Routes worth knowing

You almost never need to type these in directly — every link in the chrome takes you there — but they're stable and bookmarkable :

- `/` — home.
- `/account` — your account ; redirects to `/account/profile`.
- `/account/profile` — profile fields.
- `/account/security` — email, password, TOTP, trusted devices.
- `/account/notifications` — notification preferences.
- `/account/danger` — schedule (or cancel) deletion.
- `/admin` — the admin section ; redirects to its first tab.
- `/admin/organizations` — list / edit organizations.
- `/admin/users` — list / invite / edit users.
- `/admin/rbac` — system admins roster + per-org roles.
- `/signin`, `/signup`, `/forgot-password` — pre-auth surfaces.

## Keyboard + touch

- **Escape** closes any open drawer or dialog.
- **Tab** moves through the drawer's controls (the focus ring is the brand-orange).
- **Enter** activates the focused button or link.
- All buttons + links are 36 px high or larger so they hit cleanly on touch.
- The notifications drawer's filter tabs follow standard tablist semantics ; arrow keys move between Unread / All.

## Setup gate

A new install that hasn't bootstrapped its first organization yet routes every URL — including sign-in and sign-up — to a `/setup` checklist page. It polls every five seconds and auto-redirects to the home page once the deploy lands. Once you're past it for the first time, you should never see it again.
