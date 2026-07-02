# RBAC System (Admin, Developer, Ambassador, Student)

## Context

Every feature in Phase 2 and Phase 3 has role-specific behavior: students see a guided onboarding, developers see a self-service dashboard, admins see audit and org tools, ambassadors see a community-facing view. The starter brief names the four roles and lists RBAC as a core module.

RBAC is the single source of truth for "what role does this user have in this org." Role assignments are scoped per `(user, organization)` — a user can be Developer in one org and Student in another. Admins are further split between org admins (per-org) and Monark admins (platform-level, cross-org).

## Goals

- Four user-facing roles: `Admin`, `Developer`, `Ambassador`, `Student`.
- A fifth platform-level role: `MonarkAdmin` (not shown in the org role picker; assignable only by another MonarkAdmin).
- Role assignments are per-org; a user has one primary role per org + optional additional grants.
- `hasRole(user, role, orgId?)` helper used everywhere.
- Permission system derived from roles via a static permission matrix — roles map to capabilities, not to individual route guards.
- Every role change is audited.

## Non-goals

- No custom roles at Phase 1. The five roles are fixed in code. Orgs cannot invent their own roles.
- No granular per-resource permissions ("user X can edit vote Y but not vote Z"). Roles gate capabilities; ownership is a separate concept checked in each module.
- No ABAC (attribute-based access control). If we ever need it, we wrap role checks rather than replacing them.
- No delegation ("grant me X's permissions for a day").

## Roles

| Role          | Scope    | Granted by                                            | Primary capabilities                                                                                                             |
| ------------- | -------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `MonarkAdmin` | Platform | Another MonarkAdmin                                   | Everything. Cross-org admin. Access to feature flags, Monark-specific admin tooling.                                             |
| `Admin`       | Per org  | Org owner or another org Admin                        | Manage org settings, members, invites, roles (below Admin). White-label.                                                         |
| `Developer`   | Per org  | Admin                                                 | Participate in votes; earn contribution points; contribute via whatever extended modules enable. Default self-onboarding target. |
| `Ambassador`  | Per org  | Admin                                                 | Represents Monark; likely overlaps with Developer capabilities plus some community-facing affordances in Phase 2+.               |
| `Student`     | Per org  | Admin (or via guided onboarding + program enrollment) | Guided onboarding; limited-time relationship; can convert to Developer.                                                          |

`MonarkAdmin` is deliberately separate from org `Admin` so the UI and code can distinguish "org owner" from "platform operator" without cross-leakage.

## Data model

```prisma
enum Role {
  MONARK_ADMIN
  ADMIN
  DEVELOPER
  AMBASSADOR
  STUDENT
}

model RoleAssignment {
  id             String   @id @default(cuid())

  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // null for MonarkAdmin (platform-level)
  organizationId String?
  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  role           Role
  grantedById    String
  grantedAt      DateTime @default(now())
  revokedAt      DateTime?
  reason         String?

  @@unique([userId, organizationId, role])
  @@index([userId])
  @@index([organizationId])
}
```

A user's "primary role in an org" is resolved by querying live role assignments for that `(userId, orgId)` pair. If more than one non-`MonarkAdmin` role is granted, the `rankOf` helper picks the higher one for display (precedence: `ADMIN > DEVELOPER > AMBASSADOR > STUDENT`).

## Permission matrix

Permissions are checked by capability, not route:

```ts
// packages/rbac/src/server/domain/permissions.ts

export const PERMISSIONS = {
  "org:update-settings": ["MONARK_ADMIN", "ADMIN"],
  "org:invite-member": ["MONARK_ADMIN", "ADMIN"],
  "org:remove-member": ["MONARK_ADMIN", "ADMIN"],
  "org:assign-role": ["MONARK_ADMIN", "ADMIN"],
  "org:assign-admin-role": ["MONARK_ADMIN"], // only MonarkAdmin grants org Admin

  "feature-flags:read": ["MONARK_ADMIN", "ADMIN"],
  "feature-flags:write": ["MONARK_ADMIN"],

  "user:disable": ["MONARK_ADMIN"],

  // Extended-module capabilities declared in their respective docs
  "onboarding:student-track-enter": ["STUDENT"],
  "voting:cast": ["MONARK_ADMIN", "ADMIN", "DEVELOPER", "AMBASSADOR"],
  "voting:create-proposal": ["MONARK_ADMIN", "ADMIN", "DEVELOPER"],
  "contributions:view-own": ["MONARK_ADMIN", "ADMIN", "DEVELOPER", "AMBASSADOR", "STUDENT"],
  "contributions:view-all": ["MONARK_ADMIN", "ADMIN"],
  "referral:invite": ["MONARK_ADMIN", "ADMIN", "DEVELOPER", "AMBASSADOR"],
} as const satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMISSIONS;
```

Extended modules extend this by adding entries in their own permission files; a small script aggregates at build time.

## API surface

```ts
// packages/rbac/src/server/index.ts

// Read
export async function hasRole(userId: string, role: Role, orgId?: string): Promise<boolean>;

export async function getUserRoles(userId: string, orgId?: string): Promise<Role[]>;

export async function primaryRole(userId: string, orgId: string): Promise<Role | null>;

export async function hasPermission(
  userId: string,
  permission: Permission,
  orgId?: string,
): Promise<boolean>;

// Guards for server actions / pages
export async function requireRole(role: Role, orgId?: string): Promise<User>;
export async function requirePermission(permission: Permission, orgId?: string): Promise<User>;

// Write
("use server");
export async function assignRole(input: {
  userId: string;
  role: Role;
  organizationId?: string; // required unless role is MonarkAdmin
  reason?: string;
}): Promise<RoleAssignment>;

("use server");
export async function revokeRole(assignmentId: string, reason?: string): Promise<void>;
```

`requireRole` / `requirePermission` are the canonical way to protect a server action or server component:

```tsx
export default async function AdminPage() {
  await requirePermission("org:update-settings");
  // ... the actual admin UI
}
```

On failure, they throw an `RbacError` caught by a route-level error boundary that redirects to a `403` page.

## UI flows

### Org admin: assign roles (`/<org>/admin/users/<userId>`)

- Role picker: current primary role shown, dropdown to change.
- Additional grants: checklist of other roles for the same org (rare but possible — e.g., a user is both Ambassador and Developer during a transition).
- Reason field (required for changes): audit trail.
- Submit → `assignRole` / `revokeRole` server actions.

### Monark admin: platform roles (`/admin/platform/users`)

- Visible only to `MonarkAdmin`.
- Search all users.
- Per-user drawer: list of orgs and roles, plus a "Grant MonarkAdmin" / "Revoke MonarkAdmin" button. Protected by a confirmation modal + type-to-confirm.

### Role-aware navigation

The app shell renders the primary role via a `useRole()` hook (hydrated from server). Sidebar items are gated by permission strings, not by role — so a future role tweak doesn't break UX.

## Dependencies

- `users`: the subject of every role assignment.
- `organizations`: most roles are org-scoped.
- `auth`: session carries the active org; RBAC resolves against that.
- `feature-flags`: gate RBAC UI visibility per-flag (e.g., custom-role UI could be flagged on for a beta).

## Integration points

### Events

```ts
export const ROLE_ASSIGNED = "rbac.role-assigned";
export const ROLE_REVOKED = "rbac.role-revoked";

export type RoleAssignedEvent = {
  assignmentId: string;
  userId: string;
  organizationId: string | null;
  role: Role;
  grantedById: string;
  reason?: string;
  at: Date;
};
```

Onboarding (Phase 2) listens to `ROLE_ASSIGNED` to start a role-specific flow when a new role lands. Feature-flags caches invalidate on role change for any flag with a role-scoped override affecting that user.

### Seed data

On fresh DB, seed:

- A `MonarkAdmin` user created from env-var credentials (only for dev — prod uses a manual seed step).
- The four standard roles are implicit in the enum; no seed row needed.

## Edge cases

- **Last admin leaves an org.** Blocked (see `organization-management.md`). RBAC helper `isLastAdmin(userId, orgId)` is the check.
- **Role changes while user is signed in.** Their session's cached role is stale until the next request. We invalidate the session-level role cache via a revalidation touch on role change; the next request rehydrates.
- **MonarkAdmin over-reach.** Every cross-org action taken by a MonarkAdmin is logged with `cross-org` tag in `domain_events` for post-hoc review.
- **Student-to-Developer conversion.** Student role is revoked and Developer role is assigned atomically in a single transaction. Both events emit.
- **User with multiple roles in one org.** Supported but discouraged. UI shows primary + "+N more" badge; capability checks union all roles.

## Risks

- **Permission matrix rot.** People add guards inline with `user.role === "ADMIN"` instead of `hasPermission`. Mitigate with an ESLint rule that forbids direct role string comparisons outside the RBAC module.
- **MonarkAdmin abuse.** Very privileged. Keep the count tiny. Require TOTP for any MonarkAdmin-only action (not just login).
- **Role assignment race.** Two admins assign roles simultaneously to the same user. Unique constraint on `(userId, organizationId, role)` prevents duplicate; last writer wins for any secondary fields. Acceptable.

## Success metrics

- 100% of authenticated routes pass through a `requirePermission` or `requireRole` check (or are explicitly opt-out with a comment).
- Zero production incidents rooted in "wrong role could access X."
- Average audit-log entries per role change = 1 (sanity check that we're recording them).

## Implementation notes

- Role checks cache per-request via `cache()` to avoid N+1 lookups when multiple components on the same page check permissions.
- The permission matrix is a plain TypeScript object so type-checking catches typos in permission strings.
- Seed the `MonarkAdmin` in dev only; prod uses a one-shot manual grant during deployment so we never have a generic superuser in committed config.
- Audit event wiring: every role mutation writes to `domain_events` and emits a bus event.

## Out of scope

- Custom / org-defined roles
- Attribute-based permissions
- Time-bound role grants (role expires at X)
- Role hierarchies beyond the built-in precedence
- Role templates for common orgs
