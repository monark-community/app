# `@monark/rbac`

Roles, permissions, assignments, scoped resolution.

- **Have** : `permissions.test.ts`, `placeholder.test.ts`. Permission registry is solid.
- **Add** :
  - `data.test.ts` (integration) ; `createCustomRole`, `updateRole`, `deleteRole` round-trip + uniqueness constraints fire ; the FK constraint `RoleAssignment.organizationId → Organization.id ON DELETE CASCADE` cleans up assignments when an org is deleted.
  - `read.test.ts` (integration) ; `findActiveAssignments` includes the platform-tier SYSADMIN row regardless of the requested orgId ; `hasPermission` short-circuits to `true` for ADMIN / SYSADMIN regardless of `RolePermission` rows.
  - `guards.test.ts` ; `requireAdmin` / `requireRoleKey` throw `ForbiddenError` when the user lacks the role ; `adminAssignmentSummary` returns the right shape.
  - `write.test.ts` ; `validateRoleKey` rejects reserved keys (`ADMIN`, `SYSADMIN`) + invalid characters ; `createRole` emits the `rbac.role-created` event with the right payload.
- **Coverage target** : 80 %.
