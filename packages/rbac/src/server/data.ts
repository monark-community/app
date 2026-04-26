import { getDb, type Prisma } from "@monark/db"
import type { Role } from "../contracts/role"

export type AssignmentRow = Prisma.RoleAssignmentGetPayload<Record<string, never>>

export async function findActiveAssignments(
  userId: string,
  orgId?: string,
): Promise<AssignmentRow[]> {
  const db = getDb()
  const where: Prisma.RoleAssignmentWhereInput = {
    userId,
    revokedAt: null,
  }
  if (orgId === undefined) {
    where.organizationId = null
  } else {
    where.OR = [{ organizationId: orgId }, { organizationId: null, role: "MONARK_ADMIN" }]
  }
  return db.roleAssignment.findMany({ where, orderBy: { grantedAt: "asc" } })
}

export async function findAssignmentForRole(
  userId: string,
  role: Role,
  orgId: string | null,
): Promise<AssignmentRow | null> {
  const db = getDb()
  return db.roleAssignment.findFirst({
    where: { userId, organizationId: orgId, role },
  })
}

export async function createAssignment(input: {
  userId: string
  role: Role
  organizationId: string | null
  grantedById: string
  reason?: string
}): Promise<AssignmentRow> {
  const db = getDb()
  return db.$transaction(async (tx) => {
    const existing = await tx.roleAssignment.findFirst({
      where: {
        userId: input.userId,
        organizationId: input.organizationId,
        role: input.role,
      },
    })
    if (existing) {
      return tx.roleAssignment.update({
        where: { id: existing.id },
        data: {
          revokedAt: null,
          revokedById: null,
          grantedById: input.grantedById,
          grantedAt: new Date(),
          reason: input.reason ?? null,
        },
      })
    }
    return tx.roleAssignment.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId,
        role: input.role,
        grantedById: input.grantedById,
        reason: input.reason ?? null,
      },
    })
  })
}

export async function revokeAssignment(
  id: string,
  revokedById: string,
  reason?: string,
): Promise<AssignmentRow | null> {
  const db = getDb()
  const existing = await db.roleAssignment.findUnique({ where: { id } })
  if (!existing || existing.revokedAt) return existing
  return db.roleAssignment.update({
    where: { id },
    data: {
      revokedAt: new Date(),
      revokedById,
      reason: reason ?? existing.reason,
    },
  })
}

export async function countActiveOrgAdmins(orgId: string): Promise<number> {
  const db = getDb()
  return db.roleAssignment.count({
    where: { organizationId: orgId, role: "ADMIN", revokedAt: null },
  })
}

// True if the user holds any admin-tier role anywhere (platform MONARK_ADMIN
// or org-scoped ADMIN). Used by enforcement gates that don't care which org
// the role is in.
export async function hasAnyAdminAssignment(userId: string): Promise<{
  hasAdmin: boolean
  earliestGrantedAt: Date | null
}> {
  const db = getDb()
  const earliest = await db.roleAssignment.findFirst({
    where: {
      userId,
      revokedAt: null,
      role: { in: ["MONARK_ADMIN", "ADMIN"] },
    },
    orderBy: { grantedAt: "asc" },
    select: { grantedAt: true },
  })
  return {
    hasAdmin: earliest !== null,
    earliestGrantedAt: earliest?.grantedAt ?? null,
  }
}
