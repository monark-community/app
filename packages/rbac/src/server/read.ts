import { ValidationError } from "@monark/common"
import { rolesForPermission, type Permission } from "../contracts/permissions"
import { pickHighest, type Role } from "../contracts/role"
import {
  findActiveAssignments,
  countActiveOrgAdmins,
  hasAnyAdminAssignment,
} from "./data"

export async function getUserRoles(userId: string, orgId?: string): Promise<Role[]> {
  const assignments = await findActiveAssignments(userId, orgId)
  return assignments.map((a) => a.role)
}

export async function hasRole(userId: string, role: Role, orgId?: string): Promise<boolean> {
  if (role !== "MONARK_ADMIN" && !orgId) {
    throw new ValidationError(
      `hasRole(${role}) requires an orgId; only MONARK_ADMIN is platform-scoped.`,
    )
  }
  const roles = await getUserRoles(userId, orgId)
  return roles.includes(role)
}

export async function primaryRole(userId: string, orgId: string): Promise<Role | null> {
  const roles = await getUserRoles(userId, orgId)
  // MONARK_ADMIN is shown only on platform admin surfaces; primary org role is the
  // highest-ranked among non-MONARK_ADMIN roles.
  const orgRoles = roles.filter((r) => r !== "MONARK_ADMIN") as Role[]
  return pickHighest(orgRoles)
}

export async function hasPermission(
  userId: string,
  permission: Permission,
  orgId?: string,
): Promise<boolean> {
  const allowed = rolesForPermission(permission)
  const userRoles = await getUserRoles(userId, orgId)
  return allowed.some((r) => userRoles.includes(r))
}

// Returns true if the user is the only active ADMIN in the given org. Used by
// org-management to block "last admin leaves" scenarios.
export async function isLastAdmin(userId: string, orgId: string): Promise<boolean> {
  const has = await hasRole(userId, "ADMIN", orgId)
  if (!has) return false
  const count = await countActiveOrgAdmins(orgId)
  return count <= 1
}

// True if the user holds any admin-tier role (platform MONARK_ADMIN or
// org-scoped ADMIN). Returns the earliest grant date so callers can compute
// "days since first admin assignment" for enforcement timers (e.g. TOTP
// 7-day hard-wall).
export async function adminAssignmentSummary(userId: string): Promise<{
  hasAdmin: boolean
  earliestGrantedAt: Date | null
}> {
  return hasAnyAdminAssignment(userId)
}
