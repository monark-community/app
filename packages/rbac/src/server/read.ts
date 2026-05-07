import { ValidationError } from "@monark/common"
import {
  ADMIN_ROLE_KEY,
  BUILTIN_ALL_PERMISSIONS_KEYS,
} from "../contracts/role"
import {
  findActiveAssignments,
  findAllActiveAssignments,
  countActiveOrgAdmins,
  hasAnyAdminAssignment,
  type AssignmentWithRole,
} from "./data"
import { getDb } from "@monark/db"

const ALL_PERMISSIONS_KEY_SET = new Set<string>(BUILTIN_ALL_PERMISSIONS_KEYS)

// ── Role helpers ─────────────────────────────────────────────────

// Returns every distinct role row the user holds an active assignment
// for in the given org. Org-tier rows + any platform-tier ADMIN
// assignment are unioned (per `findActiveAssignments` semantics).
export async function getUserRoles(
  userId: string,
  orgId?: string,
): Promise<AssignmentWithRole["role"][]> {
  const assignments = await findActiveAssignments(userId, orgId)
  // De-dup by roleId — a user could (in theory) have the same role
  // assigned at platform AND org tier. The presentation surface
  // doesn't care which assignment surfaced it.
  const seen = new Set<string>()
  const out: AssignmentWithRole["role"][] = []
  for (const a of assignments) {
    if (seen.has(a.roleId)) continue
    seen.add(a.roleId)
    out.push(a.role)
  }
  return out
}

// Full assignment list (with role) across every org the user touches.
// Powers admin user-detail surfaces that need to render every role +
// its scope.
export async function getAllAssignments(
  userId: string,
): Promise<AssignmentWithRole[]> {
  return findAllActiveAssignments(userId)
}

// Org-tier role membership check. Platform-tier (SYSADMIN) requires
// no orgId — its presence is unconditional. ADMIN and custom roles
// require an orgId since they're scoped per-org.
export async function hasRoleKey(
  userId: string,
  roleKey: string,
  orgId?: string,
): Promise<boolean> {
  // Sysadmin is the only platform-tier role ; any other key checked
  // without an orgId would be a programming error in the caller.
  if (roleKey === ADMIN_ROLE_KEY && !orgId) {
    throw new ValidationError(
      `hasRoleKey(${roleKey}) requires an orgId — ADMIN is org-tier.`,
    )
  }
  const roles = await getUserRoles(userId, orgId)
  return roles.some((r) => r.key === roleKey)
}

// ── Permission resolution ────────────────────────────────────────

// True if the user holds at least one active assignment that grants
// the requested permission. Two short-circuit paths :
//
//   - Built-in `SYSADMIN` (any orgId) — sysadmins implicitly hold every
//     permission across every org. `findActiveAssignments` already
//     surfaces platform-tier SYSADMIN regardless of the `orgId` arg.
//   - Built-in `ADMIN` for the requested org — org admins implicitly
//     hold every permission within their org. `findActiveAssignments`
//     surfaces ADMIN only when the assignment's orgId matches.
//
// Falling through to the non-admin path checks `RolePermission` rows
// for any of the user's other role assignments.
export async function hasPermission(
  userId: string,
  permission: string,
  orgId?: string,
): Promise<boolean> {
  const assignments = await findActiveAssignments(userId, orgId)
  if (assignments.length === 0) return false
  for (const a of assignments) {
    if (a.role.builtIn && ALL_PERMISSIONS_KEY_SET.has(a.role.key)) {
      return true
    }
  }
  const roleIds = assignments.map((a) => a.roleId)
  const db = getDb()
  const granted = await db.rolePermission.findFirst({
    where: { roleId: { in: roleIds }, permission },
    select: { id: true },
  })
  return granted !== null
}

// Returns true when the user is the only active built-in ADMIN row in
// the org. Used by org-management to block "last admin leaves"
// scenarios.
export async function isLastAdmin(
  userId: string,
  orgId: string,
): Promise<boolean> {
  const has = await hasRoleKey(userId, ADMIN_ROLE_KEY, orgId)
  if (!has) return false
  const count = await countActiveOrgAdmins(orgId)
  return count <= 1
}

export async function adminAssignmentSummary(userId: string): Promise<{
  hasAdmin: boolean
  earliestGrantedAt: Date | null
}> {
  return hasAnyAdminAssignment(userId)
}
