# Users

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
