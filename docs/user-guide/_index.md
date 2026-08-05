# User Guide

Everything Monark Core lets you do today, written for the people using it. No code, no scripts ; just what you can click on and what happens when you do.

The guide is grouped below ; each page is structured top-to-bottom in the order most people meet the features. Skim the headings, jump to whatever you need.

## Using the app

- **[Signing in and your account](account.md)** — anyone with a Monark account. Covers the sign-up + sign-in flows, password resets, two-factor authentication, profile editing, notification preferences, personal API keys, and how to delete (or rescue) your account.
- **[Navigating the app](navigation.md)** — anyone, again. Covers the navigation rail, the app bar (breadcrumb, global search, the assistant launcher, and your avatar — which now holds your notifications), the drawers, and the keyboard / touch affordances around them.
- **[The assistant](assistant.md)** — the built-in AI assistant (where enabled) : opening it, chatting about your data, and confirming the changes it proposes.
- **[Working with data (records)](data.md)** — the custom record databases (Data Models) your admins set up : finding a model, the records table, filtering + saved views, creating / editing records, and following changes.
- **[Automations](automations.md)** — building a flow (triggers, actions, wiring), running and testing it, run history + logs, and what a flow is allowed to do.
- **[Using values in an automation](automation-variables.md)** — the companion to the above : how a step reuses values from the trigger, earlier steps, and workflow variables (the variable picker, the value/variable toggle, reference names, the Set Variable step).
- **[Using the public API](public-api.md)** — for developers integrating with Monark (where the feature is enabled). Covers creating an API key (full or limited to a subset of your permissions), authenticating, the `/api/v1` endpoints + OpenAPI spec, rate limits, errors, and service accounts for shared integrations.

## Admin

- **[Admin section](admin.md)** — for operators and admins of an organization. Covers the `/admin` routes : managing users + invites, editing organizations, defining roles + permissions, webhooks, Data Models, Files, Secrets, service accounts, and what only system administrators can do.

## Extensions

Optional modules — each keeps its user guide **with the module** (so removing the module removes its docs), and only applies where the module is enabled.

- **[Calendar](../../packages/calendar/docs/user-guide.md)** — Day / Week / Month / Agenda views, creating and moving events, reminders, conflict warnings, ICS import/export, and managing calendars.
- **[Kanban](../../packages/kanban/docs/user-guide.md)** — boards, columns, and cards ; drag-and-drop, assignees / reviewers, priority / due / subtasks, and filtering + saved views.

## What's _not_ documented here

- Anything you'd reach through the URL `/setup` ; that page is a one-time wizard the operator sees before the first organization is created. After bootstrap it disappears.
- Internal tools (the developer's console, the dev overlay) ; those are dev-only surfaces and live in [technical-documentation](../technical-documentation/).
- Future modules listed in [features-planning/](../features-planning/) ; those are roadmaps, not shipped behaviour.

If you spot something the app does that's not in here, treat that as a doc bug and call it out.
