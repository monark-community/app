# Admin section

For operators of an organization — anyone with a Monark `ADMIN` (org-tier) or `SYSADMIN` (platform-tier) role. Visible to non-admins as a missing affordance : the admin pin doesn't appear in the primary navigation drawer, and `/admin` URLs redirect to the home page.

The admin section lives at `/admin/*` and ships three tabs : **Organizations**, **Users**, **Roles & permissions**.

## Reaching `/admin`

- Open the primary navigation drawer (hamburger top-left). Admins see a filled-orange **Admin** button anchored at the bottom.
- Click it. You land on the first tab (Organizations).
- Or type `/admin` in the URL ; it redirects to the same place.

The admin layout pins a sidebar with the three tab links. On wide viewports it sits to the left of the content ; on narrow viewports it collapses to a horizontal strip across the top.

## A note on tenancy

The admin UX adapts to the deploy's tenancy mode :

- **Single-tenant** (default) — exactly one organization exists. The Organizations tab redirects directly to that organization's edit page ; no list view. The role manager auto-selects the singleton org. User-side flows that would ask you to pick an org collapse to nothing.
- **Multi-tenant** (operator opt-in via the `tenancy.multi-tenant` feature flag) — multiple organizations live side by side. Admin surfaces grow org pickers ; the Organizations tab renders a paginated list.

This guide notes per-mode differences inline.

## Organizations

`/admin/organizations` (multi-tenant) or directly `/admin/organizations/<id>` (single-tenant). Lets you manage the brand + identity of every organization on the deploy.

### List (multi-tenant only)

A paginated card list. Top of the page :

- **Search** — filters by display name or slug as you type (debounced).
- **Load more** — appears when there are more rows than the current page can show.

Each row is a clickable card with the org's logo, display name, slug, primary-color swatch, and a chevron pointing into the detail page.

### Detail / edit

The single edit surface for an organization :

- **Logo** — click to upload (or replace / remove if a logo is already set). Cropped + compressed automatically.
- **Display name** — what shows everywhere a user sees the org's name. Saves on blur.
- **Slug** — the URL-safe identifier. 2–60 characters, lowercase letters / digits / dashes only. Saves on blur ; trying to use a slug that's already taken surfaces a clean error toast. **Renaming a slug** doesn't break old links — the previous slug is recorded with a 90-day redirect so anything pointing at the old URL still resolves.
- **Primary color** — hex code (e.g. `#F0870C`) ; the live swatch next to the input previews the value as you type. Drives the brand accent across the app + transactional emails for that org.

Saving any field emits a domain event so downstream listeners (notification fan-out, audit log) record what changed.

## Users

`/admin/users`. The directory of every user on the deploy plus pending invites awaiting acceptance.

### List + filters

The list is a paginated table-like view. The header row holds :

- **Search** — debounced match against display name + email.
- **Filter** (funnel icon) — opens a dropdown with submenus for **Role**, **Status**, **Joined**, **Email-verified**. Each filter is a radio choice ; the default is "All".
- **Invite user** — opens the invite dialog (see below).

Active filters render as small chips ("Role : Administrator", "Status : Pending deletion", …) right after the search bar. Each chip has an × to clear that one filter.

Pending invites render at the top of the list with a yellow **Pending** pill and a trash button to revoke. Real users follow with avatar, name, email, and any state badges (**Disabled**, **Pending deletion**) plus a chevron pointer into the detail page.

### Invite a user

The **Invite user** button opens a dialog with :

- **Email** — required.
- **Role** — pick from the org's available roles (built-in admin + custom roles in the role manager).
- **Organization** (multi-tenant only) — the org the invite scopes to. Single-tenant pins this automatically.
- **Full name** (optional) — pre-fills the recipient's display name on signup ; also used to address them in the invite email's greeting.

Submitting sends an invite email with a unique link. The invite expires after 14 days. The email's greeting reads the optional full name when present ; otherwise generic.

Once an invite is sent, it appears in the user list as a pending row. Click the trash button to revoke it ; the link in the email becomes invalid immediately.

When the recipient signs up (or signs in for the first time after accepting), the invite consumes : the user joins the org with the role you set, and the row turns into a real user.

### User detail

`/admin/users/<id>`. Several cards stacked top-to-bottom :

#### Identity card

Avatar, display name, email, joined timestamp, status badges (**Disabled**, **Pending deletion**, **Email unverified**).

#### Profile editor

Same fields the user sees on their own profile : avatar, banner, display name, bio, language. You're editing on their behalf. Saves on blur. While the user is in deletion grace, every field is locked read-only and a banner explains the lockdown.

#### Roles

The user's role assignments render as a flex-wrap of removable chips (color-tinted by the role's color). Each chip has an X to revoke that role.

A dashed-border **+ Add new role** chip at the end opens the assign dialog :

- **Organization** (multi-tenant only) — the org to scope the role to. Single-tenant pins the singleton.
- **Role** — pick from the org's role list. Built-in admin + every custom role created in the role manager.

The dialog wipes its selections each time it opens.

#### Account actions

Today this card has a single button : **Send password reset email**. Triggers Supabase's standard reset flow against the user's address ; the user picks the new password themselves on the link's landing page. You never see or set the new value. Useful when a user is locked out and contacts you.

#### Notifications

The same toggle matrix the user sees on their own preferences page, but applied to *their* row. Use it sparingly ; outside of compliance / GDPR overrides, users prefer to manage their own. The Security × Email cell is locked on for them too.

#### Danger zone

Three buttons :

- **Request deletion** — schedules the standard 14-day grace deletion against the target. The user receives the same notification email + can cancel themselves. You can't request your own deletion from here ; use your own `/account/danger` for that.
- **Cancel scheduled deletion** — only visible when the user is mid-grace.
- **Delete permanently** — opens a typed-email confirmation dialog. You must type the user's email address verbatim before the **Delete** button enables. Confirming hard-deletes the row + removes the Supabase auth user. No grace period for this path. You can't hard-delete yourself.

## Roles & permissions

`/admin/rbac`. Two stacked sections :

### System administrators

Read-only roster of every account holding the platform-tier `SYSADMIN` role. Each row shows :

- Avatar + name + email.
- "Since {date}" — when the assignment was granted.

`SYSADMIN` is the highest tier in the system : holds every permission across every organization, can override any org-tier admin. The roster is read-only on purpose ; granting and revoking sysadmin happens via the `pnpm sysadmin` CLI tool the operator runs from their workstation, not from the UI. The card is here so any admin can see who has the power to override them.

### Per-org roles

The role manager for one organization at a time.

Top of the section :

- **Organization picker** (multi-tenant only) — pick the org whose roles you want to manage. Single-tenant pins the singleton.
- **Search** — filters the role list by name or key.
- **New role** — links to the create-role page (see below).

Below that, a list of every role available within the selected org :

- The built-in **Administrator** role appears first. It's marked with a **Built-in** badge + an **All permissions** annotation. You can edit its name, description, and color, but the permission grid is locked (built-in admin always grants everything ; new permissions added to the system are auto-granted).
- Any custom roles you've created follow. Each row carries the role's color-tinted chip + an optional description.

Clicking any row navigates to the role's edit page.

### Role editor

Reached via **New role** (create) or by clicking a row (edit). A full page so the permission set has room to breathe.

Top fields :

- **Name** — the friendly display name. Required. The internal key used for code-side guards is auto-derived from the name (you don't see or pick it). If a role with that derived key already exists, the save surfaces a clean validation error.
- **Description** — optional ; surfaces on the role list to remind operators what the role is for.
- **Color** — optional hex code. The live swatch next to the input previews the value. Drives the chip color across the user-detail roles surface and the role list.

Permission section :

- **Search bar** at the top — filters across keys + descriptions of every permission.
- **Categories** — collapsible sections (Organization, Users, Roles & permissions, Platform). Each category has :
  - A **tri-state checkbox** in the header (none / some / all). Click to bulk toggle every permission in that category. "Some" jumps to "all" so partial-fill → grant-rest is a single click.
  - A **count pill** showing `selected/total`.
  - A list of the category's permissions when expanded ; each is a checkbox + the permission key + a one-line description.

When you start typing in the search box, every category that has matches auto-expands so you don't have to click each one open. Clearing the search collapses them back.

Page footer :

- **Cancel** — discards changes and returns to the manager.
- **Save** / **Create role** — depending on the mode.
- **Delete role** — only visible when editing a non-built-in role. Confirms via a browser dialog ; deleting also drops every assignment of that role.

### What's a permission

Each permission carries a stable key (`organizations:read`, `users:invite`, …), a human-readable description (what surface it gates, what action it permits), and a category (used for grouping in the editor). The list lives in the codebase ; the editor populates from a live tRPC query so adding a new permission appears automatically the next time the page loads.

## TOTP enforcement on admins

Admins have to enrol in two-factor authentication within 7 days of signing in. Two visible tiers :

- **Soft wall** (within the 7-day window) : amber banner across the top of every `/account` page. Other admin routes still work. The banner says "Two-factor required for admin access ; enable TOTP below."
- **Hard wall** (overdue) : red banner with a count of days overdue. Every route outside `/account` redirects you back here ; clicking an admin link triggers a toast saying "Admin access restricted — re-enable two-factor authentication to regain access."

Once you enrol the banners disappear immediately and admin routes unlock without a refresh.

## Audit + observability

Every admin write — role assigned, role revoked, user deletion requested, organization renamed, invite sent / revoked — emits a domain event. Today the event hits the notifications subscriber + the application logs. Phase-2 wires an admin-side audit log surface ; until then, the operator's logging stack (ELK, Sentry, etc.) is the system of record.

## What admins *can't* do today

- **Change a user's email directly.** The flow is in the [backlog](../todo/backlog.md) ; needs a design call between "direct mutation" (fast but skips user confirmation) and "pending-token with user confirmation" (safer but new infra). Until then, ask the user to change it themselves from `/account/security`.
- **Bulk operations** (bulk assign role, bulk delete, bulk invite). Single-row only.
- **Cross-org role copying.** Each org's roles are scoped to the org ; recreating the same role in another org is a manual exercise.
- **Audit / activity feed.** No timeline view yet ; rely on logs.
