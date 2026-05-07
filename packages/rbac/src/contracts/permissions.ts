// Permissions are checked by name (e.g. `requirePermission(ctx, "org:update-settings")`),
// not by raw role comparison. Adding a new permission means adding an
// entry here ; adding a new role-aware feature means using `hasPermission`
// rather than `hasRole`.
//
// Static metadata only — descriptions + categories used by the
// /admin/rbac surface to render permission toggles. The role → permission
// mapping itself lives in the `RolePermission` table now ; operators
// configure each role's permissions through the UI. Built-in `ADMIN`
// short-circuits to "all permissions" in code regardless of what's in
// the table, so adding a permission here automatically grants it to
// admins without a data backfill.

export type PermissionCategory =
  | "organization"
  | "users"
  | "rbac"
  | "platform"

export type PermissionDef = {
  description: string
  category: PermissionCategory
}

export const PERMISSIONS = {
  "org:update-settings": {
    description: "Edit organization profile (name, slug, logo, brand color).",
    category: "organization",
  },
  "org:invite-member": {
    description: "Send invites to new members.",
    category: "users",
  },
  "org:remove-member": {
    description: "Remove existing members from the organization.",
    category: "users",
  },
  "org:assign-role": {
    description: "Grant or revoke non-admin roles to members.",
    category: "rbac",
  },
  "org:assign-admin-role": {
    description: "Grant or revoke the admin role to members.",
    category: "rbac",
  },
  "rbac:manage-roles": {
    description: "Create, edit, and delete custom roles for the organization.",
    category: "rbac",
  },
  "feature-flags:read": {
    description: "View feature flag definitions and current overrides.",
    category: "platform",
  },
  "feature-flags:write": {
    description: "Set or remove feature flag overrides.",
    category: "platform",
  },
  "user:disable": {
    description: "Disable user accounts (admin lockout).",
    category: "users",
  },
} as const satisfies Record<string, PermissionDef>

export type Permission = keyof typeof PERMISSIONS

export function listPermissions(): Permission[] {
  return Object.keys(PERMISSIONS) as Permission[]
}

export function getPermissionDef(permission: Permission): PermissionDef {
  return PERMISSIONS[permission]
}

// Convenience for the /admin/rbac matrix : grouped by category, in
// declaration order so the UI reads the same way every time.
export function permissionsByCategory(): Record<PermissionCategory, Permission[]> {
  const grouped: Record<PermissionCategory, Permission[]> = {
    organization: [],
    users: [],
    rbac: [],
    platform: [],
  }
  for (const key of listPermissions()) {
    grouped[PERMISSIONS[key].category].push(key)
  }
  return grouped
}

export function isKnownPermission(value: string): value is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value)
}
