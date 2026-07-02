# User Guide

Everything Monark Core lets you do today, written for the people using it. No code, no scripts ; just what you can click on and what happens when you do.

The app is split into three audiences ; pick the page that matches you :

- **[Signing in and your account](account.md)** — anyone with a Monark account. Covers the sign-up + sign-in flows, password resets, two-factor authentication, profile editing, notification preferences, and how to delete (or rescue) your account.
- **[Navigating the app](navigation.md)** — anyone, again. Covers the top bar (logo, breadcrumb, apps launcher, notifications bell, your avatar), the side drawers, and the keyboard / touch affordances around them.
- **[Admin section](admin.md)** — for operators and admins of an organization. Covers the `/admin` routes : managing users + invites, editing organizations, defining roles + permissions, and what only system administrators can do.

Each page is structured top-to-bottom in the order most people encounter the features. Skim the headings, jump to whatever you need.

## What's _not_ documented here

- Anything you'd reach through the URL `/setup` ; that page is a one-time wizard the operator sees before the first organization is created. After bootstrap it disappears.
- Internal tools (the developer's console, the dev overlay) ; those are dev-only surfaces and live in [technical-documentation](../technical-documentation/).
- Future modules listed in [features-planning/](../features-planning/) ; those are roadmaps, not shipped behaviour.

If you spot something the app does that's not in here, treat that as a doc bug and call it out.
