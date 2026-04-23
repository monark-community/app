# User Management

## Context

The starter brief names "user management" as one of the RBAC-adjacent core modules. This module owns the `User` entity itself — profile data, account-level settings, account deletion, and the administrative operations an admin performs on other users within an org. It is distinct from `auth` (which owns credentials and sessions) and from `rbac` (which owns role assignments).

Think of it as the "user data" layer. Auth handles "who's signed in"; orgs handle "which team do they belong to"; RBAC handles "what can they do"; this module handles "who are they."

## Goals

- Profile: display name, avatar, email (display + change flow), locale preference.
- Account settings page: name, avatar, locale, notifications preferences (skeleton — actual notifications are a Phase 2+ concern).
- Self-service account deletion with confirmation and a grace period.
- Admin view: list users in an org, search, view details, remove from org, soft-disable an account (cross-org, admin-only, rare).
- Consistent `User` read API used by every other module.

## Non-goals

- No social features at Phase 1 (following, profiles visible to other users). Profiles are private to the user and admins.
- No impersonation ("log in as user") at Phase 1. Tempting for support, but risky; defer until a controlled mechanism is designed.
- No GDPR data export at Phase 1. Not on the critical path; add before going wide in the EU if required.
- No user-to-user messaging.

## User stories

- **As a user**, I can edit my display name, avatar, and preferred language in `/account/profile`.
- **As a user**, I can change my email address, which requires re-verifying the new one before it takes effect.
- **As a user**, I can delete my account with a clear warning about what goes (memberships, votes, etc.) and a 14-day grace period where recovery is possible.
- **As an org admin**, I can see every member of my org, search by name or email, click into a member's detail view.
- **As a Monark admin**, I can soft-disable any user account (all sessions revoked, flagged account) with an audit trail.

## Data model

Builds on the `User` model from `auth-login-password.md`:

```prisma
model User {
  id                String   @id
  email             String   @unique
  emailVerifiedAt   DateTime?
  displayName       String?
  avatarUrl         String?
  localePreference  String   @default("en")        // IETF language tag
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  deletedAt         DateTime?                      // soft delete (self-deletion or admin disable)
  disabledAt        DateTime?                      // admin-initiated disable, distinct from deletion

  pendingEmailChange PendingEmailChange?
  // relations declared elsewhere
}

model PendingEmailChange {
  id            String   @id @default(cuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  newEmail      String
  tokenHash     String   @unique
  requestedAt   DateTime @default(now())
  expiresAt     DateTime
}
```

Soft delete vs disable:
- `deletedAt` → user initiated, grace period applies, eventual hard delete.
- `disabledAt` → admin initiated, indefinite. User can't sign in. Restorable by admin.

## API surface

### Self-service

```ts
// packages/users/src/server/procedures/profile.ts
"use server"
export async function updateProfile(input: {
  displayName?: string
  avatarUrl?: string
  localePreference?: string
}): Promise<User>

"use server"
export async function requestEmailChange(newEmail: string): Promise<void>
//   Sends a verification email to newEmail; no mutation until confirmed.

"use server"
export async function confirmEmailChange(token: string): Promise<void>
//   Updates User.email; revokes all sessions (force re-sign-in).

"use server"
export async function uploadAvatar(file: File): Promise<{ avatarUrl: string }>
//   Uploads to Supabase Storage `avatars` bucket, 1:1 crop server-side,
//   returns the public URL.

// packages/users/src/server/procedures/account.ts
"use server"
export async function requestAccountDeletion(): Promise<{
  deletionCompletesAt: Date
}>

"use server"
export async function cancelAccountDeletion(): Promise<void>
```

### Admin

```ts
// packages/users/src/server/procedures/admin.ts (RBAC-guarded)

"use server"
export async function listOrgMembers(orgId: string, opts?: {
  search?: string
  role?: Role
  status?: "active" | "disabled"
  limit?: number
  cursor?: string
}): Promise<PaginatedMembers>

"use server"
export async function disableUser(userId: string, reason: string): Promise<void>
//   Sets disabledAt; revokes all sessions; emits audit event.

"use server"
export async function enableUser(userId: string): Promise<void>
//   Clears disabledAt.
```

### Read interface

```ts
// packages/users/src/server/index.ts
export async function getById(id: string): Promise<User | null>
export async function getByIdOrThrow(id: string): Promise<User>
export async function getByEmail(email: string): Promise<User | null>

export async function getCurrent(): Promise<User | null>  // same as auth.getCurrentUser but with full profile hydrated
```

## UI flows

### Profile page (`/account/profile`)

- Avatar with upload (drag-drop + file picker).
- Display name field (autosave on blur, with debounce).
- Email field (read-only; "Change email" link opens modal).
- Locale dropdown (en, fr — populated from `feature-flags`'s `users.locale-options` flag).
- Save handled by `updateProfile` on blur.

### Change email modal

- New email field. On submit → `requestEmailChange`. Closes modal, shows toast: "Check your new email to confirm."
- Confirmation link lands on `/account/confirm-email?token=...`; server action runs `confirmEmailChange`; forces sign-out.

### Account deletion

- `/account/delete` page.
- Clear bullet list: what will be deleted (memberships, posts, votes), what's retained (anonymized audit trail), timeline (14 days).
- Require typing the user's email to confirm.
- Submit → `requestAccountDeletion`. Immediate sign-out; redirect to `/` with a confirmation message that shows the scheduled deletion date.
- If user signs in during the grace period, we show a banner "Your account is scheduled for deletion on <date>. [Cancel]" on every page.

### Admin members view (`/<org>/admin/users`)

- Table: avatar, name, email, role, joined, last active, status badge.
- Search box filters client-side for the first page; server paginates beyond.
- Row click → detail drawer: profile info, role (edit via RBAC), memberships in other orgs (Monark admin only — regular org admins can't see other orgs), recent sign-ins (from trusted-devices).
- Actions: remove from org, disable (admin-level), re-enable.

## Dependencies

- `auth`: credentials, session, email verification.
- `organizations`: membership context for most admin operations.
- `rbac`: who can disable whom, who can see cross-org user data.
- `feature-flags`: `users.avatar-upload`, `users.self-deletion` toggles.
- Supabase Storage for avatars.

## Integration points

### Events

```ts
export const USER_PROFILE_UPDATED = "user.profile-updated"
export const USER_EMAIL_CHANGED = "user.email-changed"
export const USER_DELETION_REQUESTED = "user.deletion-requested"
export const USER_DELETION_CANCELED = "user.deletion-canceled"
export const USER_DELETED = "user.deleted"                    // after grace period
export const USER_DISABLED = "user.disabled"
export const USER_ENABLED = "user.enabled"
```

Downstream listeners (examples):
- Onboarding (Phase 2) consumes `USER_PROFILE_UPDATED` to re-evaluate completeness.
- Voting (Phase 3) marks votes as "from deleted user" when `USER_DELETED` fires, rather than cascading the delete (we keep vote integrity; we anonymize the voter).
- Contribution-estimation (Phase 3) stops accruing for disabled users.

### Hard-delete job

Daily cron: selects users where `deletedAt < now - 14 days` and executes the anonymization:
- Email → `deleted-<uuid>@monark.invalid`.
- Display name → `"Deleted User"`.
- Avatar → null, blob removed from storage.
- Supabase auth row deleted via `supabase.auth.admin.deleteUser`.
- Event `USER_DELETED` emitted so downstream modules can anonymize their references.

Memberships and roles are deleted (cascade from `User`). Events in `domain_events` retain the (now-anonymized) userId for audit.

## Edge cases

- **User deletes account, then signs in with same email during grace.** Email is still associated; sign-in works; banner shows. They can cancel deletion.
- **User deletes account, hard delete runs, they sign up again with the same email.** Fresh account; history is gone.
- **Avatar upload fails mid-way.** The `avatarUrl` stays unchanged; user sees an error toast.
- **Email change collision.** New email already exists on another account → `requestEmailChange` rejects with "that email is already in use." Does NOT leak whether an account exists; use generic copy.
- **Admin disables themselves.** Blocked in UI and server action: admin can't disable their own account. They must have another admin do it.
- **Locale preference set to something the app doesn't support.** Zod-validated against the supported list; reject unknown values.

## Risks

- **GDPR-adjacent confusion.** "Soft delete + grace + hard delete" must be clearly explained to avoid users thinking their data is deleted when it isn't yet. Legal copy matters.
- **Avatar storage costs.** Moderate scale is fine; if it balloons, add a cron to dedupe by content hash.
- **PII in audit logs.** Old displayName / email appear in `domain_events` after user deletion. We accept this — audit logs have a retention policy (e.g., 2 years) and we don't hash PII there. Document in privacy policy.

## Success metrics

- % of signups who set a display name + avatar within 7 days (onboarding health signal).
- Account-deletion rate; cancellation rate during grace (voluntary retention signal).
- Admin-initiated disables per month (ideally zero; non-zero indicates abuse or spam).

## Implementation notes

- Avatar processing: upload to Supabase Storage, server-side crop via `sharp` (Next 16 runtime supports it). Save as WebP, 512×512 max.
- Email change is a two-step with token; token hashed server-side (same pattern as invites). 30-minute expiry.
- Hard-delete cron: scheduled via Supabase's `pg_cron` extension or a Next route handler hit by an external scheduler (Vercel Cron / GitHub Actions). Idempotent — rerunnable.

## Out of scope

- Impersonation ("login as user")
- GDPR data export
- User profile pages visible to other users
- User-to-user messaging
- Phone number as a profile field (not needed; TOTP uses authenticator apps)
- Notification preference granularity (the skeleton lives here; concrete channels are Phase 2+ when the notifications system lands)
