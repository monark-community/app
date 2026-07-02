import { getDb, type Prisma } from "@monark/db";
import { ADMIN_ROLE_KEY, BUILTIN_ALL_PERMISSIONS_KEYS, SYSADMIN_ROLE_KEY } from "../contracts/role";

export type AssignmentRow = Prisma.RoleAssignmentGetPayload<Record<string, never>>;
export type AssignmentWithRole = Prisma.RoleAssignmentGetPayload<{
  include: { role: true };
}>;
// Same as AssignmentWithRole but with the joined Organization (id +
// slug + displayName) on every org-scoped row. The user-detail surface
// uses this so it can render the org's friendly name instead of its id.
export type AssignmentWithRoleAndOrg = Prisma.RoleAssignmentGetPayload<{
  include: {
    role: true;
    organization: { select: { id: true; slug: true; displayName: true } };
  };
}>;
export type RoleRow = Prisma.RoleGetPayload<Record<string, never>>;
export type RoleWithPermissions = Prisma.RoleGetPayload<{
  include: { permissions: true };
}>;

// Org-scoped active-assignments lookup. When `orgId` is undefined we
// only return platform-tier assignments (organizationId is null) ;
// when set we return rows for that org *plus* any platform-tier
// SYSADMIN the user holds — sysadmins implicitly carry every
// org-scoped right too.
export async function findActiveAssignments(
  userId: string,
  orgId?: string,
): Promise<AssignmentWithRole[]> {
  const db = getDb();
  const where: Prisma.RoleAssignmentWhereInput = {
    userId,
    revokedAt: null,
  };
  if (orgId === undefined) {
    where.organizationId = null;
  } else {
    where.OR = [
      { organizationId: orgId },
      {
        organizationId: null,
        role: { is: { key: SYSADMIN_ROLE_KEY, builtIn: true } },
      },
    ];
  }
  return db.roleAssignment.findMany({
    where,
    include: { role: true },
    orderBy: { grantedAt: "asc" },
  });
}

// Every active assignment a user holds across every org, with the
// joined Role row + Organization (when org-scoped) attached so callers
// can render role + scope without a second round-trip. Used by admin
// user-detail and the rbac.myRoles procedure.
export async function findAllActiveAssignments(
  userId: string,
): Promise<AssignmentWithRoleAndOrg[]> {
  const db = getDb();
  return db.roleAssignment.findMany({
    where: { userId, revokedAt: null },
    include: {
      role: true,
      organization: { select: { id: true, slug: true, displayName: true } },
    },
    orderBy: { grantedAt: "asc" },
  });
}

export async function findAssignmentForRole(
  userId: string,
  roleId: string,
  orgId: string | null,
): Promise<AssignmentRow | null> {
  const db = getDb();
  return db.roleAssignment.findFirst({
    where: { userId, organizationId: orgId, roleId },
  });
}

// Idempotent grant. Three cases :
//   1. No existing row for (user, org, role)            → create it
//   2. Existing row, currently revoked                  → reactivate
//      (clear revokedAt/By, refresh grantedAt/By/reason)
//   3. Existing row, currently active                   → no-op
//      (return as-is, signal `alreadyActive` so the caller can
//      short-circuit the audit event + the friendly "already
//      assigned" CLI path)
//
// Case 3 is what callers want when re-running a grant for the same
// scope — overwriting `grantedById` on an active row would also
// trip the FK if the new value isn't a real user, so we leave the
// row untouched. UI re-grants land on this path as a no-op too,
// which is the right user-facing semantic.
export async function createAssignment(input: {
  userId: string;
  roleId: string;
  organizationId: string | null;
  grantedById: string | null;
  reason?: string;
}): Promise<{ row: AssignmentRow; alreadyActive: boolean }> {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const existing = await tx.roleAssignment.findFirst({
      where: {
        userId: input.userId,
        organizationId: input.organizationId,
        roleId: input.roleId,
      },
    });
    if (existing) {
      if (existing.revokedAt === null) {
        return { row: existing, alreadyActive: true };
      }
      const reactivated = await tx.roleAssignment.update({
        where: { id: existing.id },
        data: {
          revokedAt: null,
          revokedById: null,
          // Cast : the active Prisma client may still type
          // `grantedById` as a non-nullable string until the
          // 20260505180000_role_assignment_granted_by_nullable
          // migration applies + `prisma generate` runs. The runtime
          // happily writes null after that.
          grantedById: input.grantedById as string,
          grantedAt: new Date(),
          reason: input.reason ?? null,
        },
      });
      return { row: reactivated, alreadyActive: false };
    }
    const created = await tx.roleAssignment.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId,
        roleId: input.roleId,
        grantedById: input.grantedById as string,
        reason: input.reason ?? null,
      },
    });
    return { row: created, alreadyActive: false };
  });
}

export async function revokeAssignment(
  id: string,
  revokedById: string | null,
  reason?: string,
): Promise<AssignmentRow | null> {
  const db = getDb();
  const existing = await db.roleAssignment.findUnique({ where: { id } });
  if (!existing || existing.revokedAt) return existing;
  return db.roleAssignment.update({
    where: { id },
    data: {
      revokedAt: new Date(),
      revokedById,
      reason: reason ?? existing.reason,
    },
  });
}

// Count of users holding the built-in ADMIN role *scoped to the
// given org*. Used by `isLastAdmin` to block the last admin's
// removal. Platform-tier admins (organizationId null) are intentionally
// excluded — they're not "this org's admin" in the bookkeeping
// sense, and the check is about org-level continuity.
export async function countActiveOrgAdmins(orgId: string): Promise<number> {
  const db = getDb();
  return db.roleAssignment.count({
    where: {
      organizationId: orgId,
      revokedAt: null,
      role: { is: { key: ADMIN_ROLE_KEY, builtIn: true } },
    },
  });
}

// True if the user holds an active platform-tier SYSADMIN
// assignment. Distinct from `hasAnyAdminAssignment` (which lights
// up for org-tier ADMIN as well) ; some surfaces — e.g. the webhook
// editor's scope chooser, the platform-tier endpoint slot in the
// org picker — are sysadmin-only and need this finer gate.
export async function hasSysadminAssignment(userId: string): Promise<boolean> {
  const db = getDb();
  const found = await db.roleAssignment.findFirst({
    where: {
      userId,
      revokedAt: null,
      organizationId: null,
      role: { is: { key: SYSADMIN_ROLE_KEY, builtIn: true } },
    },
    select: { id: true },
  });
  return found !== null;
}

// True if the user holds an active built-in admin-tier role anywhere :
// either platform-tier `SYSADMIN` (any orgId is fine — sysadmins span
// every org) or org-tier `ADMIN` for any single org. Used by /admin
// route gating ; both kinds of admin land on the same surface.
export async function hasAnyAdminAssignment(userId: string): Promise<{
  hasAdmin: boolean;
  earliestGrantedAt: Date | null;
}> {
  const db = getDb();
  const earliest = await db.roleAssignment.findFirst({
    where: {
      userId,
      revokedAt: null,
      role: {
        is: {
          key: { in: [...BUILTIN_ALL_PERMISSIONS_KEYS] },
          builtIn: true,
        },
      },
    },
    orderBy: { grantedAt: "asc" },
    select: { grantedAt: true },
  });
  return {
    hasAdmin: earliest !== null,
    earliestGrantedAt: earliest?.grantedAt ?? null,
  };
}

// ── Role table CRUD ──────────────────────────────────────────────

export async function findRoleById(id: string): Promise<RoleWithPermissions | null> {
  const db = getDb();
  return db.role.findUnique({
    where: { id },
    include: { permissions: true },
  });
}

export async function findBuiltInAdminRole(): Promise<RoleRow | null> {
  const db = getDb();
  return db.role.findFirst({
    where: { key: ADMIN_ROLE_KEY, builtIn: true, organizationId: null },
  });
}

export async function listRolesForOrg(organizationId: string): Promise<RoleWithPermissions[]> {
  const db = getDb();
  // Custom roles owned by this org *plus* the platform-wide built-ins
  // that *can* be granted at org tier (today that's just `ADMIN`).
  // `SYSADMIN` is excluded explicitly : the role exists only for
  // platform-tier assignments granted via the CLI / direct SQL, never
  // through the admin UI.
  return db.role.findMany({
    where: {
      key: { not: SYSADMIN_ROLE_KEY },
      OR: [{ organizationId }, { organizationId: null, builtIn: true }],
    },
    include: { permissions: true },
    orderBy: [{ builtIn: "desc" }, { name: "asc" }],
  });
}

// Each `permission` entry is a parsed (module, key) pair sourced from
// `validatePermissionList`. The DB stores both columns separately ;
// uniqueness is on (roleId, module, permission).
export type RolePermissionInput = { module: string; key: string };

export async function createCustomRole(input: {
  organizationId: string;
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  permissions: RolePermissionInput[];
}): Promise<RoleWithPermissions> {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description,
        color: input.color,
        builtIn: false,
        organizationId: input.organizationId,
      },
    });
    if (input.permissions.length > 0) {
      await tx.rolePermission.createMany({
        data: input.permissions.map((p) => ({
          roleId: role.id,
          module: p.module,
          permission: p.key,
        })),
      });
    }
    return tx.role.findUniqueOrThrow({
      where: { id: role.id },
      include: { permissions: true },
    });
  });
}

export async function updateRolePatch(input: {
  id: string;
  name?: string;
  description?: string | null;
  color?: string | null;
  permissions?: RolePermissionInput[];
}): Promise<RoleWithPermissions> {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const patch: Prisma.RoleUpdateInput = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.color !== undefined) patch.color = input.color;
    if (Object.keys(patch).length > 0) {
      await tx.role.update({ where: { id: input.id }, data: patch });
    }
    if (input.permissions !== undefined) {
      // Replace-all : drop the existing rows, recreate with the new
      // set. Cheap because each role typically has a small permission
      // set ; saves an explicit diff.
      await tx.rolePermission.deleteMany({ where: { roleId: input.id } });
      if (input.permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: input.permissions.map((p) => ({
            roleId: input.id,
            module: p.module,
            permission: p.key,
          })),
        });
      }
    }
    return tx.role.findUniqueOrThrow({
      where: { id: input.id },
      include: { permissions: true },
    });
  });
}

export async function deleteRoleRow(id: string): Promise<void> {
  const db = getDb();
  // Caller must have already gated on `builtIn === false` and zero
  // active assignments ; the FK's `ON DELETE RESTRICT` is the safety
  // net but we surface a clean error before reaching it.
  await db.role.delete({ where: { id } });
}

export async function countActiveAssignmentsForRole(roleId: string): Promise<number> {
  const db = getDb();
  return db.roleAssignment.count({
    where: { roleId, revokedAt: null },
  });
}

// All active SYSADMIN holders. Used by the /admin/rbac surface so
// every operator can see who can override them, and by the CLI's
// `list` subcommand. Joined User row carries display info ; orderBy
// `grantedAt` so the longest-tenured sysadmins float to the top.
export async function listSysadminHolders(): Promise<
  Array<{
    assignmentId: string;
    grantedAt: Date;
    user: { id: string; email: string; displayName: string | null };
  }>
> {
  const db = getDb();
  const rows = await db.roleAssignment.findMany({
    where: {
      revokedAt: null,
      organizationId: null,
      role: { is: { key: SYSADMIN_ROLE_KEY, builtIn: true } },
    },
    include: {
      user: { select: { id: true, email: true, displayName: true } },
    },
    orderBy: { grantedAt: "asc" },
  });
  return rows.map((row) => ({
    assignmentId: row.id,
    grantedAt: row.grantedAt,
    user: row.user,
  }));
}

// Alias kept short for the tRPC procedure that re-exports this. The
// CLI uses `listSysadminHolders` directly via the data layer.
export const listSysadmins = listSysadminHolders;

/**
 * Active built-in ADMIN holders for one organization. Returns the
 * user ids only ; callers (notification fan-out, etc.) hydrate the
 * surrounding User row themselves. Excludes platform-tier SYSADMIN
 * (a separate group) and revoked assignments.
 */
export async function listOrgAdminUserIds(organizationId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.roleAssignment.findMany({
    where: {
      organizationId,
      revokedAt: null,
      role: { is: { key: ADMIN_ROLE_KEY, builtIn: true } },
    },
    select: { userId: true },
  });
  // De-dup just in case ; the unique key on the assignment table
  // already guarantees no double-grants of the same role per user
  // per org, so this is defensive.
  return [...new Set(rows.map((r) => r.userId))];
}

/**
 * Active platform-tier SYSADMIN holders. Same shape as
 * `listOrgAdminUserIds` ; user ids only, no User row hydration.
 * Used by webhook notification fan-out for platform-tier endpoints
 * (organizationId = null) and by other system-tier alerting paths
 * that need the on-call group.
 */
export async function listSysadminUserIds(): Promise<string[]> {
  const db = getDb();
  const rows = await db.roleAssignment.findMany({
    where: {
      revokedAt: null,
      organizationId: null,
      role: { is: { key: SYSADMIN_ROLE_KEY, builtIn: true } },
    },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}
