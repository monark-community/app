# Apps Hub

## Context

Dominic's local branch already includes an "Apps" menu in the app bar; a right-side drawer listing product surfaces with one card per registered service. Currently it ships with a single hard-coded entry (Monark Core, which is the app itself). The CEO mentioned interest in having quick access to relevant external tools directly from the app.

The Apps Hub formalises this into an admin-manageable directory: entries are stored in the database (not hard-coded in config), gated by RBAC so different roles see different services, and manageable without a deploy.

## Goals

- Admin-editable list of app/service entries (name, description, URL, icon, category, access roles).
- Role-based visibility: show/hide entries based on the user's role.
- Apps drawer in the app bar renders entries from the database instead of static config.
- Seed with initial entries (Notion, GitHub, Figma, Discord, monark.io, ui.monark.io).

## Non-goals

- No OAuth integration or single-sign-on. Links open in a new tab.
- No usage analytics (how often each app is clicked).
- No custom icon upload. Icons are selected from a predefined set (Lucide icon names).

## Data model

This does not need a dedicated module. The `AppEntry` table lives in `@monark/organizations` or as a lightweight addition to the core db schema; it is org-scoped.

```prisma
model AppEntry {
  id            String   @id @default(cuid())
  organizationId String
  organization  Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  name          String
  tagline       String?   // one-line description shown under the name
  url           String    // absolute URL; internal links allowed
  iconName      String    // Lucide icon name (e.g. "BookOpen", "Github", "Figma")
  category      String?   // display grouping label
  external      Boolean   @default(true)    // open in new tab
  sortOrder     Int       @default(0)       // display order

  // RBAC: if empty, visible to all authenticated users
  // If set, only users with at least one of these role keys see this entry
  visibleToRoles String[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([organizationId, sortOrder])
}
```

## API surface

```ts
// Added to @monark/organizations/server or as a lightweight standalone module

apps.list()         // returns entries visible to the current user's roles
apps.listAll()      // admin: returns all entries regardless of role filter

apps.create({ name, tagline?, url, iconName, category?, external?, sortOrder?, visibleToRoles? })
apps.update({ id, ...partialFields })
apps.delete({ id })
apps.reorder({ ids: string[] })  // reorder by dragging in admin UI
```

## UI flows

### Apps drawer (app bar — all users)

Replaces the current static `APPS` config. Fetches from `apps.list()` on open. Renders cards per the existing design (icon, name, tagline, external-link indicator, "Current" badge for the active surface).

### Apps management (`/admin/apps`)

- Card grid of all registered app entries with edit/delete/reorder controls
- "New app" button → create form
- Drag-to-reorder (or manual sort order field)

### App create / edit form

- Name (required)
- Tagline (optional, shown under name in drawer)
- URL (required; validated as a URL)
- Icon (searchable Lucide icon picker)
- Category (optional grouping label)
- External link toggle (default: on)
- Visible to roles (multi-select of role names from RBAC; empty = visible to all)
- Sort order (number input; auto-increments on create)

## Seed entries

| Name | URL | Icon | Category | External |
|---|---|---|---|---|
| Monark Core | / | Boxes | Platform | false (current app) |
| Notion | https://notion.so | FileText | Workspace | true |
| GitHub | https://github.com/monark-community | Github | Development | true |
| Figma | https://figma.com | Figma | Design | true |
| Discord | https://discord.com (org link) | MessageSquare | Community | true |
| Monark Website | https://monark.io | Globe | Platform | true |
| UI Registry | https://ui.monark.io | Layers | Development | true |

## RBAC

No new permissions. Uses existing `organizations:update-settings` for the admin management UI. The public `apps.list()` procedure is authenticated-only (any signed-in user) with server-side role filtering applied per entry.
