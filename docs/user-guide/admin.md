# Admin section

For operators of an organization ; anyone with a Monark `ADMIN` (org-tier) or `SYSADMIN` (platform-tier) role. Visible to non-admins as a missing affordance : the admin pin doesn't appear in the primary navigation drawer, and `/admin` URLs redirect to the home page.

The admin section lives at `/admin/*` and ships eight tabs : **Organizations**, **Users**, **Roles & permissions**, **Webhooks**, **Data Models**, **Files**, **Secrets**, and **Service accounts**. Some tabs are gated by a feature flag and only appear when it's turned on for the deploy.

## Reaching `/admin`

- Open the primary navigation drawer (hamburger top-left). Admins see a filled-orange **Admin** button anchored at the bottom.
- Click it. You land on the first tab (Organizations).
- Or type `/admin` in the URL ; it redirects to the same place.

The admin layout pins a sidebar with the tab links. On wide viewports it sits to the left of the content ; on narrow viewports it collapses to a horizontal strip across the top.

## A note on tenancy

The admin UX adapts to the deploy's tenancy mode :

- **Single-tenant** (default) : exactly one organization exists. The Organizations tab redirects directly to that organization's edit page ; no list view. The role manager auto-selects the singleton org. User-side flows that would ask you to pick an org collapse to nothing.
- **Multi-tenant** (operator opt-in via the `tenancy.multi-tenant` feature flag) : multiple organizations live side by side. Admin surfaces grow org pickers ; the Organizations tab renders a paginated list.

This guide notes per-mode differences inline.

## Organizations

`/admin/organizations` (multi-tenant) or directly `/admin/organizations/<id>` (single-tenant). Lets you manage the brand + identity of every organization on the deploy.

### List (multi-tenant only)

A paginated card list. Top of the page :

- **Search** : filters by display name or slug as you type (debounced).
- **Load more** : appears when there are more rows than the current page can show.

Each row is a clickable card with the org's logo, display name, slug, primary-color swatch, and a chevron pointing into the detail page.

### Detail / edit

The single edit surface for an organization :

- **Logo** : click to upload (or replace / remove if a logo is already set). Square JPEG, PNG or WebP up to 2 MB ; cropped + compressed automatically (SVG isn't accepted). This is the mark shown on the sign-in page, in the nav rail, and at the top of the emails the app sends.
- **Display name** : what shows everywhere a user sees the org's name. Saves on blur.
- **Slug** : the URL-safe identifier. 2–60 characters, lowercase letters / digits / dashes only. Saves on blur ; trying to use a slug that's already taken surfaces a clean error toast. **Renaming a slug** doesn't break old links ; the previous slug is recorded with a 90-day redirect so anything pointing at the old URL still resolves.
- **Primary color** : hex code (e.g. `#2563EB`) ; the live swatch next to the input previews the value as you type. Themes the whole app for that org (buttons, focus rings, the sidebar accent, the first chart series) plus its transactional emails. Text painted on top flips between black and white automatically so a light or pastel color stays readable. Leave it blank to fall back to the color the deployment was configured with.

Saving any field emits a domain event so downstream listeners (notification fan-out, audit log) record what changed.

## Users

`/admin/users`. The directory of every user on the deploy plus pending invites awaiting acceptance.

### List + filters

The list is a paginated table-like view. The header row holds :

- **Search** : debounced match against display name + email.
- **Filter** (funnel icon) : opens a dropdown with submenus for **Role**, **Status**, **Joined**, **Email-verified**. Each filter is a radio choice ; the default is "All".
- **Invite user** : opens the invite dialog (see below).

Active filters render as small chips ("Role : Administrator", "Status : Pending deletion", …) right after the search bar. Each chip has an × to clear that one filter.

Pending invites render at the top of the list with a yellow **Pending** pill and a trash button to revoke. Real users follow with avatar, name, email, and any state badges (**Disabled**, **Pending deletion**) plus a chevron pointer into the detail page.

### Invite a user

The **Invite user** button opens a dialog with :

- **Email** : required.
- **Role** : pick from the org's available roles (built-in admin + custom roles in the role manager).
- **Organization** (multi-tenant only) : the org the invite scopes to. Single-tenant pins this automatically.
- **Full name** (optional) : pre-fills the recipient's display name on signup ; also used to address them in the invite email's greeting.

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

- **Organization** (multi-tenant only) : the org to scope the role to. Single-tenant pins the singleton.
- **Role** : pick from the org's role list. Built-in admin + every custom role created in the role manager.

The dialog wipes its selections each time it opens.

#### Account actions

Today this card has a single button : **Send password reset email**. Triggers Supabase's standard reset flow against the user's address ; the user picks the new password themselves on the link's landing page. You never see or set the new value. Useful when a user is locked out and contacts you.

#### Notifications

The same toggle matrix the user sees on their own preferences page, but applied to _their_ row. Use it sparingly ; outside of compliance / GDPR overrides, users prefer to manage their own. The Security × Email cell is locked on for them too.

#### Danger zone

Three buttons :

- **Request deletion** : schedules the standard 14-day grace deletion against the target. The user receives the same notification email + can cancel themselves. You can't request your own deletion from here ; use your own `/account/danger` for that.
- **Cancel scheduled deletion** : only visible when the user is mid-grace.
- **Delete permanently** : opens a typed-email confirmation dialog. You must type the user's email address verbatim before the **Delete** button enables. Confirming hard-deletes the row + removes the Supabase auth user. No grace period for this path. You can't hard-delete yourself.

## Roles & permissions

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

## TOTP enforcement on admins

Admins have to enrol in two-factor authentication within 7 days of signing in. Two visible tiers :

- **Soft wall** (within the 7-day window) : amber banner across the top of every `/account` page. Other admin routes still work. The banner says "Two-factor required for admin access ; enable TOTP below."
- **Hard wall** (overdue) : red banner with a count of days overdue. Every route outside `/account` redirects you back here ; clicking an admin link triggers a toast saying "Admin access restricted ; re-enable two-factor authentication to regain access."

Once you enrol the banners disappear immediately and admin routes unlock without a refresh.

## Webhooks

`/admin/webhooks`. Register HTTP endpoints that receive a POST for every domain event the platform emits. Use webhooks to push lifecycle events (role changes, user sign-ins, org updates) into external systems ; social-media automation, SIEM ingestion, audit-log sinks, or anything else that can accept a signed HTTP POST.

Webhooks are gated by three permissions registered at boot : `webhooks.read` (view endpoints + deliveries), `webhooks.write` (create / edit / delete / rotate), and `webhooks.retry` (manually retry a failed delivery). Org-scoped endpoints check the permission against the endpoint's organization ; platform-tier endpoints require the permission at the platform tier (sysadmins).

### Endpoint list

The list page shows every endpoint for a given scope (one organization, or platform-tier). Each row carries :

- The endpoint URL.
- A **status badge** : Active (green), Disabled (amber), or Deleted (muted).
- A **consecutive failures** warning when the count is non-zero.
- A **subscription count** showing how many event types the endpoint listens to.

A search bar at the top filters by URL.

### Creating an endpoint

Click **New endpoint**. The create form asks for :

- **URL** ; HTTPS only in production. In development the validator also accepts HTTP for localhost, `127.0.0.1`, `[::1]`, and RFC 1918 private hosts (`10.x`, `172.16-31.x`, `192.168.x`). Anything else (public host over HTTP, `file://`, `ws://`) is rejected.
- **Description** (optional) ; a human-readable note for your team.
- **Subscriptions** ; a categorized picker driven by the runtime event-type registry. Each module that emits domain events gets a collapsible group with :
  - A **tri-state header checkbox** (none / some / all) to bulk-toggle every event in the module.
  - A **count chip** on the right showing `selected / total`.
  - One labelled checkbox per event type ; mono-font key + plain-language description.

  Ticking the header writes a single prefix subscription when every event in the module shares a common dotted prefix (e.g. `rbac.`) ; otherwise it writes N exact subscriptions.

Submitting creates the endpoint and reveals the **signing secret** in a green banner at the top of the edit page. **This is the only time the plaintext secret is visible.** Copy it now ; once you navigate away the only recovery path is rotating the secret (which generates a new one).

### Editing an endpoint

Click any row to land on the edit page. You can change :

- URL, description, and subscriptions (same rules as create).
- **Status** ; toggle between Active and Disabled. A disabled endpoint stops receiving new deliveries but pre-existing pending rows still drain.
- **Rotate secret** ; generates a new signing secret and shows it once. The old secret becomes invalid immediately ; update your receiver before rotating.
- **Delete** ; removes the endpoint permanently.

Subscriptions that were saved in a previous deploy but no longer appear in the current event registry show as removable chips above the module groups.

### Delivery history

`/admin/webhooks/<id>/deliveries`. A paged list of every delivery attempted for this endpoint. Each row shows :

- The event type.
- Status : **Delivered** (green), **Pending** (amber), **Failed** (red).
- Attempt count.
- Last error (if any).
- Timestamp.

### Delivery detail

`/admin/webhooks/<id>/deliveries/<deliveryId>`. Two sections :

- **Payload** ; the full JSON body that was (or would be) sent, pretty-printed.
- **Attempt log** ; one row per attempt showing HTTP status code (or network error), duration, and timestamp.

A **Retry now** button at the top fires one synchronous delivery attempt so you get immediate feedback. Subsequent retries go through the worker as usual.

### Auto-disable

After 5 consecutive failed deliveries the endpoint flips to Disabled automatically. The failure counter resets on the next successful delivery. When auto-disabled :

- The endpoint appears with a Disabled badge + a warning showing the failure count.
- New events stop generating deliveries for this endpoint.
- Pre-existing pending deliveries still drain.
- An in-app + email notification is sent to admins.

To re-enable : open the endpoint's edit page and set status back to Active.

### Signing

Every outgoing request carries five headers your receiver can use to verify authenticity :

| Header                             | Value                                                                 |
| ---------------------------------- | --------------------------------------------------------------------- |
| `Webhook-Delivery-Id`              | The delivery row's unique id.                                         |
| `Webhook-Delivery-Idempotency-Key` | Stable per (endpoint, event, correlation) ; use it to dedupe retries. |
| `Webhook-Event-Type`               | The source event's type (e.g. `rbac.role-created`).                   |
| `Webhook-Timestamp`                | Unix seconds ; recomputed per attempt.                                |
| `Webhook-Signature`                | `v1=<hex hmac-sha256(secret, "<timestamp>.<body>")>`                  |

Receivers verify by recomputing the HMAC over `<timestamp>.<body>` using their stored copy of the shared secret and a constant-time compare. Including the timestamp in the signed payload defeats replay attacks outside a tolerance window (suggested ±5 minutes).

### Routing

Endpoints can be scoped to a single organization or to the entire platform :

- **Platform-tier** (no organization selected) ; receives every matching event regardless of source org. Use for sysadmin / SIEM / audit-log integrations.
- **Org-scoped** ; receives events that carry a matching `organizationId`, plus user-tied events (sign-in, password change, TOTP changes) for users who are members of that org.

## Data Models

`/admin/data-models`. Define your own record types at runtime ; no code change, no deploy. This is Monark's general-purpose database layer (Notion-databases style) ; the records themselves are browsed and edited by end users at `/data/models/<model-key>`.

### Schema builder

The list page shows every Data Model in the org ; **New model** creates one (name, an immutable URL-safe key, optional icon). Opening a model gives you its field editor :

- **Add field** : pick a type (text, long text, rich text, number, boolean, date, date-time, single-select, multi-select, relation, URL, email, formula, file, attachments) and its per-type options (select choices, relation target, formula expression, allowed file formats, …). A field's **key is immutable** after creation (it's the stored property name) ; only its label is editable later.
- **Reorder** fields by dragging ; **archive** a field to hide it from forms while keeping old values readable.
- Every model automatically owns a reserved required **title** field.
- **Request an index** on a hot field for faster filtering at scale (provisioned in the background).
- **Integrations** : map the model's fields onto another module's needs (e.g. Calendar's "time" + "calendar" slots) so records materialize into that module.

### Access

Two layers. **Model-level** : each model auto-registers per-model record permissions (read / write / delete) that surface in the role editor, so a role can be granted just one model's records. **Record-level** : an individual record can be restricted to specific roles (a record with no restriction is visible to everyone who can access the model ; a restricted record is invisible (a 404) to others). Data admins (`data-models.manage-schema`, which built-in admins hold) bypass the record layer.

### Public forms

Where the `data-models.public-forms` flag is on, a model's editor grows a **Public forms** section : share a link so people who don't have an account can submit records to that model, without exposing the model itself.

Creating a form asks for :

- **Who can submit.** _Anyone with the link_ (one shareable URL, rate-limited) or _invited people only_ (each recipient gets a unique link and can submit once). Invited recipients are managed from the form's card.
- **Which fields go on the form.** Only the fields you pick are shown and accepted ; everything else on the model stays private. Required fields have to be included.
- Optional **intro** and **thank-you** text.

A form can also publish a **public board** : a searchable, read-only list of approved entries, which is what turns this into a feature-request or bug-report inbox rather than a write-only form. You choose who can browse it (anyone with the link, or invited people only) and which fields are visible there ; the entry title always is. Two engagement toggles sit alongside it : **voting** (upvotes, with a top-sorted board) and **discussions** (comments, posted immediately, with admins able to hide or delete them).

Deleting a form kills its link and any outstanding invites ; records already submitted through it are kept.

## Files

`/admin/files`. Manage the org's uploaded files. Files are stored via a signed-upload flow (the server never handles the bytes) into private buckets ; a Data Model `FILE` / `ATTACHMENTS` field is the most common source. The page lists the org's files with size + type, offers a short-lived signed download link, and lets you remove a file (object deleted + row soft-deleted). Gated by the `files.enabled` flag ; actions gate on the `files.*` permissions.

## Secrets

`/admin/secrets`. A per-organization encrypted **key → value** store for external tokens and API keys, encrypted at rest (AES-256-GCM). It is **write-only over the wire** : you add or replace a secret by name, but the value is never displayed again and there is no "reveal" ; the plaintext is readable only server-side, on the trusted automation-node path (`ctx.getSecret`). The page lists secret **names** + metadata (description, last-used) only. Add / edit gates on `secrets.manage` ; the list on `secrets.read`. This is what lets an Automation node reach an external system without an author ever seeing the credential.

## Service accounts

`/admin/service-accounts`. Machine principals for the public API ; an org-owned "user" (of kind `SERVICE`) that a script, agent, or integration authenticates as, with its own admin-assigned roles. From here you **create** a service account, **assign / change its roles** (which is its least-privilege knob), **disable** it (instantly kills its keys), and manage its **API keys** (minted once, shown once). Gated by the `public-api.service-accounts` feature flag and the `api-keys.manage-service-accounts` permission. Personal (human) API keys live separately under [your account](account.md), not here. See the [public API guide](public-api.md) for how keys authenticate.

## Automation integrations

`/admin/automation`. The per-organization connection config for every service your automations trigger on or act through : **GitHub**, **Telegram**, **X (Twitter)**, and **Discord**, one tab each. They live here rather than as top-level destinations because connecting an account is an org-wide, admin-caliber setting, not a place you work day to day.

Each tab is independently gated. A service whose feature flag is off shows a short "this integration is disabled" note naming the flag instead of its form, and a service you lack the `<service>.manage` permission for is read-only. The section as a whole is hidden (and the page 404s) when `automation.enabled` is off.

What you connect here is what an automation's trigger and action nodes can then reach ; the flows themselves are built in [Automations](automations.md), not here.

## Achievements

`/admin/achievements`. Define the achievements users can earn and the conditions that award them. An achievement carries a name, description, icon, and point value, and can be enabled or disabled without deleting it.

Each achievement holds a list of **conditions**. A condition names a domain event to watch (`kanban.card-created`, `wiki.page-created`, and so on), how many matching events are needed, and which field of the event payload names the user to credit ; it can also carry equality matchers on the payload, so "moved a card into Done" is a different condition from "moved a card". An achievement with no conditions can never be earned, and the editor says so. Awarding is automatic from there : the module counts progress per user on the event bus, so nothing is granted by hand.

Gated by the `achievements.enabled` feature flag. The user-facing gallery is reached from the account menu, not from a nav entry.

## Audit + observability

Every admin write : role assigned, role revoked, user deletion requested, organization renamed, invite sent / revoked ; emits a domain event. Today the event hits the notifications subscriber + the application logs. Phase-2 wires an admin-side audit log surface ; until then, the operator's logging stack (ELK, Sentry, etc.) is the system of record.

## What admins _can't_ do today

- **Change a user's email directly.** The flow is in the [backlog](../todo/backlog.md) ; needs a design call between "direct mutation" (fast but skips user confirmation) and "pending-token with user confirmation" (safer but new infra). Until then, ask the user to change it themselves from `/account/security`.
- **Bulk operations** (bulk assign role, bulk delete, bulk invite). Single-row only.
- **Cross-org role copying.** Each org's roles are scoped to the org ; recreating the same role in another org is a manual exercise.
- **Audit / activity feed.** No timeline view yet ; rely on logs.
- **Webhook delivery rate limiting per endpoint.** A receiver returning 429 retries with backoff but doesn't pause sibling deliveries to the same endpoint.
- **Webhook delivery log export.** No CSV or JSON download of delivery history.
