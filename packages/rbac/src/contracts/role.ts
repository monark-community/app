// The hardcoded `Role` enum was retired in favour of the `Role` /
// `RolePermission` tables ; consumers identify roles by their `key`
// (string) or by the row's `id`. Two built-in role keys are reserved
// for code-side checks ; both grant "all permissions" implicitly via
// short-circuits in the rbac read layer, but their scope is locked
// to one assignment shape :
//
//   - `SYSADMIN` : platform-tier only (RoleAssignment.organizationId
//     IS NULL). Never UI-assignable ; granted through the
//     `tools/sysadmin.ts` CLI or a direct SQL insert.
//   - `ADMIN`    : org-tier only (RoleAssignment.organizationId IS
//     NOT NULL). Assignable through /admin/users to designate per-org
//     administrators.
export const SYSADMIN_ROLE_KEY = "SYSADMIN" as const;
export const ADMIN_ROLE_KEY = "ADMIN" as const;

export type SysadminRoleKey = typeof SYSADMIN_ROLE_KEY;
export type AdminRoleKey = typeof ADMIN_ROLE_KEY;

// Convenience for code paths that grant "everything" to either tier
// (e.g. the rbac read layer's permission short-circuit). These keys
// live on `Role` rows with `builtIn = true` and `organizationId =
// NULL` ; the rbac write layer reserves them so operators can't
// create custom roles that collide with the code-side guards.
export const BUILTIN_ALL_PERMISSIONS_KEYS = [SYSADMIN_ROLE_KEY, ADMIN_ROLE_KEY] as const;
