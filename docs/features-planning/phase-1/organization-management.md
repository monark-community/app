# Organization Management

## Context

The starter brief specifies "single org / multiple org support, full brand customization (white-label), users per organization with invite flow." Even if Monark itself runs day-one with a single internal org, the multi-org model is part of the foundation — it's too disruptive to retrofit later.

This module owns the Organization concept end to end: creation, membership, invites, white-label configuration. User profile data lives in the `users` module; role assignments live in `rbac`. This module is the glue.

## Goals

- An organization is a first-class entity with its own slug, display name, and brand settings.
- Every user belongs to at least one org (an implicit "personal" org is NOT created — a user either accepts an invite or creates an org during onboarding).
- Multi-org support from day 1: a user can be a member of multiple orgs and switch between them in the UI.
- Invite flow: an org owner/admin generates an invite (email or link), recipient signs up or signs in, accepts.
- White-label theming: each org configures a primary color, logo, and optional custom domain (domains deferred).
- A stable `org_id` is carried in the session so RBAC/users/features-flags can scope per org.

## Non-goals

- No billing / subscriptions at Phase 1. Adding it later doesn't touch the org model; billing just attaches metadata.
- No custom domains at Phase 1 (DNS + SSL is non-trivial; revisit if a concrete client demands it).
- No org hierarchy (parent/child orgs). Flat structure only.
- No org merging / splitting. If the need arises, it's bespoke ops work, not a self-serve feature.

## User stories

- **As an admin creating a new org**, I give it a name, we generate a slug, I land on the org dashboard.
- **As an org owner**, I can invite someone by email with a specified role; they receive an invite link.
- **As an invitee**, clicking the link takes me through a sign-up (or sign-in) flow that lands me in the org with the specified role.
- **As a multi-org user**, I can switch orgs from a dropdown in the top navigation; my session's org changes and the sidebar / data all reflect the new context.
- **As an org admin**, I can edit the org's name, slug (with friction — it breaks URLs), and white-label settings.
- **As an org admin**, I can remove a member (which revokes their role assignments for this org only; other orgs unaffected).

## Data model

```prisma
model Organization {
  id          String   @id @default(cuid())
  slug        String   @unique                     // used in URLs: /<slug>/app
  displayName String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?                            // soft delete

  // Brand / white-label
  logoUrl     String?                              // Supabase storage URL
  primaryColor String?                             // oklch literal
  // More white-label fields can be added without migration

  memberships OrganizationMembership[]
  invites     Invite[]
}

model OrganizationMembership {
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  joinedAt       DateTime @default(now())
  leftAt         DateTime?

  @@unique([userId, organizationId])
  @@index([organizationId])
}

model Invite {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  email          String                           // invitee's email; case-normalized
  role           Role                             // assigned on accept
  invitedById    String                           // references User.id
  tokenHash      String   @unique                 // hash of the one-time link token
  expiresAt      DateTime
  acceptedAt     DateTime?
  acceptedById   String?                          // References User.id of who accepted

  @@index([organizationId])
  @@index([email])
}
```

`Role` is defined in `rbac-system.md`.

## API surface

### Organization CRUD

```ts
// packages/organizations/src/server/procedures/*.ts

"use server";
export async function createOrganization(input: {
  displayName: string;
  slug?: string; // auto-derived if absent
}): Promise<Organization>;

("use server");
export async function updateOrganization(
  id: string,
  input: Partial<{
    displayName: string;
    slug: string;
    logoUrl: string;
    primaryColor: string;
  }>,
): Promise<Organization>;

("use server");
export async function deleteOrganization(id: string): Promise<void>;
//   Soft-delete; marks deletedAt; all memberships remain in history.
//   RBAC-guarded: owner only.
```

### Membership

```ts
"use server";
export async function listMembers(orgId: string): Promise<MemberView[]>;

("use server");
export async function removeMember(orgId: string, userId: string): Promise<void>;
```

### Invites

```ts
"use server";
export async function createInvite(
  orgId: string,
  input: {
    email: string;
    role: Role;
  },
): Promise<Invite>;

("use server");
export async function listInvites(
  orgId: string,
  opts?: { status?: "pending" | "accepted" | "expired" },
): Promise<Invite[]>;

("use server");
export async function revokeInvite(orgId: string, inviteId: string): Promise<void>;

("use server");
export async function acceptInvite(token: string): Promise<{ organizationId: string }>;
//   Called from /invite/<token> landing page after user is signed in.
```

### Switching

```ts
"use server";
export async function switchActiveOrg(orgId: string): Promise<void>;
//   Updates session claim; subsequent requests scope to the new org.
```

### Read interface

```ts
// packages/organizations/src/server/index.ts
export async function getCurrentOrg(): Promise<Organization | null>;
export async function getUserOrgs(userId: string): Promise<Organization[]>;
export async function requireOrg(): Promise<Organization>; // throws if none
```

## UI flows

### Create org (`/onboarding/create-org`)

- First-run page after signup if user has no memberships.
- Fields: display name (required), slug (pre-filled from name, editable).
- On submit: creates org, creates membership with role Admin, stamps user as active in this org, redirects to `/<slug>/app`.

### Org switcher

- Dropdown in the top-left of every authed page.
- Lists user's orgs with their logos.
- Bottom action: "Create new org" + "Accept invite" (if a pending invite exists keyed to their email).

### Org settings (`/<slug>/settings`)

- Tabs: General (name, slug), Branding (logo, primary color), Members, Invites, Danger (delete).
- Branding tab previews the component shell with the chosen primary applied in real time.
- Slug change shows a warning: "Your URLs will change. Old URLs will redirect for 30 days."

### Members tab

- Table: avatar, name, email, role (editable inline via RBAC module UI), joined date, actions (remove).
- Invite button → modal → email + role picker.

### Invite accept (`/invite/<token>`)

1. Resolve token → show "You've been invited to join Acme as Developer" page.
2. If not signed in: sign up / sign in CTA; after auth, return here with the token.
3. If signed in: "Accept" / "Decline" buttons. Accept fires `acceptInvite`.
4. Accept path creates a membership, assigns the role, sets the active org, redirects to `/<slug>/app`.

### White-label

Primary color + logo are resolved server-side per request and injected into the app shell via CSS custom properties. Implementation mirrors the pattern from `@monark/ui`'s theme registry-item: a small server component injects `<style>` in the layout that redefines `--primary` for the duration of the request.

## Dependencies

- `users` (same phase): org memberships reference users.
- `rbac` (same phase): roles applied via invites and membership changes; org admin checks gate mutations.
- `auth` (same phase): session carries `activeOrganizationId`.
- `feature-flags` (same phase): `orgs.multi-org` toggles the UI between single-org and multi-org modes (useful during Monark's internal-only period).
- Supabase storage for logos.

## Integration points

### Events

```ts
export const ORGANIZATION_CREATED = "organization.created";
export const MEMBER_JOINED = "organization.member-joined";
export const MEMBER_REMOVED = "organization.member-removed";
export const INVITE_SENT = "organization.invite-sent";
export const INVITE_ACCEPTED = "organization.invite-accepted";
```

Onboarding (Phase 2) listens to `MEMBER_JOINED` to kick off role-specific onboarding. Referral (Phase 2) listens to `INVITE_SENT` if we want to tie referrals to invites.

### Session shape

Supabase session is extended with a JWT custom claim `org_id`. `getCurrentOrg()` reads that claim (plus verifies the user still has a live membership). Switching orgs forces a session refresh with a new `org_id` claim.

## Edge cases

- **User is invited to an org they already belong to.** Invite accept is idempotent — it no-ops if the membership exists and logs a warning. UI shows "You're already a member."
- **Slug collisions.** Globally unique; on creation, we try the sanitized slug, then append `-2`, `-3`, etc. On manual rename, we reject with a clear "that slug is taken."
- **Old slug after rename.** Store the previous slug in a `slug_redirects` table with an `expiresAt` 30 days out; middleware resolves redirects. Cleanup cron deletes expired.
- **User is the sole admin of an org and tries to leave.** Block with "Assign another admin first." Same for account deletion — see `user-management.md`.
- **Invite expired between generation and click.** Show "expired" page with "request a new invite" hint (email the inviter).
- **Email case.** Invites are compared case-insensitively; invitee's actual signup email case is preserved.

## Risks

- **Slug becomes URL and identity surface.** Users expect it to never change. Be thoughtful about allowing changes; consider gating behind "confirm by typing the current slug."
- **White-label token injection.** Primary color is user input. Sanitize: parse as oklch and reject anything that can't be validated; never pass the raw string into CSS without validation.
- **Session-carried `org_id` stale after removal.** Middleware revalidates membership per request and forces a redirect to org switcher if missing.

## Success metrics

- Time from user signup → joined first org < 3 minutes (for invited users) or < 1 minute (for self-created).
- Org settings edits per admin per month (engagement signal).
- Zero "I'm in the wrong org" support tickets (happens with ambiguous org switcher UX).

## Implementation notes

- Store `primaryColor` in oklch form; validate on write via Zod.
- Slug sanitization: lowercase, replace whitespace with `-`, strip non-alphanumeric-hyphen, collapse double hyphens, trim leading/trailing hyphens, max 40 chars.
- Session claim management: Supabase supports custom JWT claims via `auth.updateUser` metadata; we mirror `activeOrganizationId` there + enforce at middleware.
- Logo uploads go to a Supabase bucket `org-logos` with RLS allowing write only by org admins; served via Supabase public CDN URL.

## Out of scope

- Org billing / plans
- Custom domains (DNS, SSL provisioning)
- Org-level SSO / SCIM
- Per-org audit-log retention policies (covered indirectly by the global audit log)
- Transferring ownership across users (owner is just a role; assign admin to another user, then they can downgrade you)
