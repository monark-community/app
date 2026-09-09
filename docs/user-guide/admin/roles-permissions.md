# Roles & permissions

`/admin/rbac`. Two stacked sections :

### System administrators

Read-only roster of every account holding the platform-tier `SYSADMIN` role. Each row shows :

- Avatar + name + email.
- "Since {date}" : when the assignment was granted.

`SYSADMIN` is the highest tier in the system : holds every permission across every organization, can override any org-tier admin. The roster is read-only on purpose ; granting and revoking sysadmin happens via the `pnpm sysadmin` CLI tool the operator runs from their workstation, not from the UI. The card is here so any admin can see who has the power to override them.

### Per-org roles

The role manager for one organization at a time.

Top of the section :

- **Organization picker** (multi-tenant only) : pick the org whose roles you want to manage. Single-tenant pins the singleton.
- **Search** : filters the role list by name or key.
- **New role** : links to the create-role page (see below).

Below that, a list of every role available within the selected org :

- The built-in **Administrator** role appears first. It's marked with a **Built-in** badge + an **All permissions** annotation. You can edit its name, description, and color, but the permission grid is locked (built-in admin always grants everything ; new permissions added to the system are auto-granted).
- Any custom roles you've created follow. Each row carries the role's color-tinted chip + an optional description.

Clicking any row navigates to the role's edit page.

### Role editor

Reached via **New role** (create) or by clicking a row (edit). A full page so the permission set has room to breathe.

Top fields :

- **Name** : the friendly display name. Required. The internal key used for code-side guards is auto-derived from the name (you don't see or pick it). If a role with that derived key already exists, the save surfaces a clean validation error.
- **Description** : optional ; surfaces on the role list to remind operators what the role is for.
- **Color** : optional hex code. The live swatch next to the input previews the value. Drives the chip color across the user-detail roles surface and the role list.

Permission section :

- **Search bar** at the top : filters across keys + descriptions of every permission.
- **Categories** : collapsible sections (Organization, Users, Roles & permissions, Platform). Each category has :
  - A **tri-state checkbox** in the header (none / some / all). Click to bulk toggle every permission in that category. "Some" jumps to "all" so partial-fill → grant-rest is a single click.
  - A **count pill** showing `selected/total`.
  - A list of the category's permissions when expanded ; each is a checkbox + the permission key + a one-line description.

When you start typing in the search box, every category that has matches auto-expands so you don't have to click each one open. Clearing the search collapses them back.

Page footer :

- **Cancel** : discards changes and returns to the manager.
- **Save** / **Create role** : depending on the mode.
- **Delete role** : only visible when editing a non-built-in role. Confirms via a browser dialog ; deleting also drops every assignment of that role.

### What's a permission

Each permission carries a stable key (`organizations:read`, `users:invite`, …), a human-readable description (what surface it gates, what action it permits), and a category (used for grouping in the editor). The list lives in the codebase ; the editor populates from a live tRPC query so adding a new permission appears automatically the next time the page loads.
