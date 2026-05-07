import { registerPermissions } from "../contracts/permissions"

// Permissions owned by the rbac module : managing custom roles,
// granting / revoking roles to users. Registered at api boot via
// `registerRbacPermissions()`.
const RBAC_PERMISSIONS = {
  "manage-roles": {
    description: "Create, edit, and delete custom roles for the organization.",
    category: "rbac",
  },
  "assign-role": {
    description: "Grant or revoke non-admin roles to members.",
    category: "rbac",
  },
  "assign-admin-role": {
    description: "Grant or revoke the admin role to members.",
    category: "rbac",
  },
} as const

export function registerRbacPermissions(): void {
  registerPermissions("rbac", RBAC_PERMISSIONS)
}
