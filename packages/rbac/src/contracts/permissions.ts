import type { Role } from "./role"

// Capabilities are checked by name (e.g. "org:update-settings"), not by raw role
// comparison. Adding a new capability means adding an entry here; adding a new
// role-aware feature means using `hasPermission` rather than `hasRole`.
//
// Extended modules can extend this matrix by adding their own permission entries
// in their /contracts files, then re-exporting via the contracts barrel.
export const PERMISSIONS = {
  "org:update-settings": ["MONARK_ADMIN", "ADMIN"],
  "org:invite-member": ["MONARK_ADMIN", "ADMIN"],
  "org:remove-member": ["MONARK_ADMIN", "ADMIN"],
  "org:assign-role": ["MONARK_ADMIN", "ADMIN"],
  "org:assign-admin-role": ["MONARK_ADMIN"],

  "feature-flags:read": ["MONARK_ADMIN", "ADMIN"],
  "feature-flags:write": ["MONARK_ADMIN"],

  "user:disable": ["MONARK_ADMIN"],

  // Extended-module capabilities; declared centrally for now to keep the matrix
  // discoverable in one place. Module-owned permission files come later.
  "onboarding:student-track-enter": ["STUDENT"],
  "voting:cast": ["MONARK_ADMIN", "ADMIN", "DEVELOPER", "AMBASSADOR"],
  "voting:create-proposal": ["MONARK_ADMIN", "ADMIN", "DEVELOPER"],
  "contributions:view-own": ["MONARK_ADMIN", "ADMIN", "DEVELOPER", "AMBASSADOR", "STUDENT"],
  "contributions:view-all": ["MONARK_ADMIN", "ADMIN"],
  "referral:invite": ["MONARK_ADMIN", "ADMIN", "DEVELOPER", "AMBASSADOR"],
} as const satisfies Record<string, Role[]>

export type Permission = keyof typeof PERMISSIONS

export function listPermissions(): Permission[] {
  return Object.keys(PERMISSIONS) as Permission[]
}

export function rolesForPermission(permission: Permission): readonly Role[] {
  return PERMISSIONS[permission]
}
