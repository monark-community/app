---
type: concept
---

# The web app shell

Every signed-in page in `services/web` renders inside one shell, mounted once in `app/(authed)/layout.tsx`. The shell owns navigation, the app bar, search and the assistant; a module's pages own only their content. The one idea: navigation is data. A module adds a destination with one entry in a list, and every surface that shows navigation reads that list.

## Before a page renders

The authenticated layout runs its gates on the server, in order: the user has a valid session; the browser is still a trusted device (a revoked device is signed out here, on its next navigation); and an account pending deletion is confined to the account pages, where the deletion can be cancelled. A pending two-factor challenge is handled earlier, by middleware that redirects to the code prompt. Nested layouts, such as the admin area's, add their own checks on top.

## Navigation

| Piece             | What it does                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRIMARY_NAV`     | The list of top-level destinations (`config/primary-nav.ts`): an id, a route and an icon each, with a translated label.                           |
| `usePrimaryNav()` | Resolves that list for the current user: hides destinations whose feature flag is off, marks the active one, and adds the admin entry for admins. |
| `NavRail`         | The slim icon rail on the left, on desktop widths.                                                                                                |
| Navigation drawer | On mobile, the brand mark in the app bar opens a drawer with the same entries.                                                                    |
| Command palette   | Its "Go to" group is built from `PRIMARY_NAV` too, so every destination is searchable by name with no second edit.                                |

Hiding an entry is a convenience. Each route enforces its own flag and permission on the server, so a hidden destination is also a closed one.

## The app bar

A sticky bar across the top carries the breadcrumb, the assistant launcher, the global search button and the user menu. The user menu holds the notification inbox (the avatar shows the unread count) and the links to the account pages. Sections with sub-pages add their own tabs below it.

## Shared screen patterns

List and detail screens compose from an app-local pattern library in `components/patterns`, so every list behaves the same:

- `DataTable`, `TableTools` and `FilterBar` for the list, its filters, sorting and columns;
- `TableDetailLayout` with `useDetailPanelRoute` for a record that opens in a side panel, kept in the URL so it can be linked;
- `DirtyFormBar` and `ConfirmDialog` for saving and destructive actions;
- `ListMobileBar` and `CreateFab` for the collapsed mobile toolbar.

Forms and table cells driven by a field definition come from the fields toolkit in `components/fields`, which the data-model engine plugs into. Every screen that waits on data shows a skeleton shaped like the content it's loading.

These patterns stay in the web app rather than a shared package because they carry routing, translation and permission-gated actions.

## Development overlay

Outside production, Alt+D opens a developer overlay with panels for the current session's flags, recent domain events and notifications.

## Related

- [Platform overview](../platform-overview.md)
- [Modules and tiers](modules-and-tiers.md)
- [Extend Monark](../../build/extend/_index.md)
