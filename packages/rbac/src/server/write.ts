import { emit, ValidationError } from "@monark/common"
import type { Role } from "../contracts/role"
import type { RoleAssignedEvent, RoleRevokedEvent } from "../contracts/events"
import { createAssignment, revokeAssignment } from "./data"

export async function assignRole(input: {
  userId: string
  role: Role
  organizationId?: string | null
  grantedById: string
  reason?: string
}): Promise<{ assignmentId: string }> {
  const { userId, role, grantedById, reason } = input
  const organizationId = input.organizationId ?? null

  if (role === "MONARK_ADMIN" && organizationId !== null) {
    throw new ValidationError("MONARK_ADMIN is platform-scoped; organizationId must be null.")
  }
  if (role !== "MONARK_ADMIN" && organizationId === null) {
    throw new ValidationError(`Role ${role} is org-scoped; organizationId is required.`)
  }
  if (!grantedById) {
    throw new ValidationError("grantedById is required.")
  }

  const row = await createAssignment({
    userId,
    role,
    organizationId,
    grantedById,
    reason,
  })

  const event: RoleAssignedEvent = {
    type: "rbac.role-assigned",
    assignmentId: row.id,
    userId,
    organizationId,
    role,
    grantedById,
    reason,
    occurredAt: new Date(),
  }
  await emit(event)

  return { assignmentId: row.id }
}

export async function revokeRole(
  assignmentId: string,
  revokedById: string,
  reason?: string,
): Promise<void> {
  if (!revokedById) {
    throw new ValidationError("revokedById is required.")
  }
  const row = await revokeAssignment(assignmentId, revokedById, reason)
  if (!row) return

  const event: RoleRevokedEvent = {
    type: "rbac.role-revoked",
    assignmentId: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    role: row.role,
    revokedById,
    reason,
    occurredAt: new Date(),
  }
  await emit(event)
}
