import { emit, NotFoundError, ValidationError } from "@monark/common"
import type {
  RoleAssignedEvent,
  RoleCreatedEvent,
  RoleDeletedEvent,
  RoleRevokedEvent,
  RoleUpdatedEvent,
} from "../contracts/events"
import {
  ADMIN_ROLE_KEY,
  SYSADMIN_ROLE_KEY,
} from "../contracts/role"
import {
  countActiveAssignmentsForRole,
  createAssignment,
  createCustomRole,
  deleteRoleRow,
  findRoleById,
  revokeAssignment,
  updateRolePatch,
} from "./data"
import {
  validateColor,
  validatePermissionList,
  validateRoleKey,
} from "./validators"

// ── Role assignment ──────────────────────────────────────────────

export async function assignRole(input: {
  userId: string
  roleId: string
  organizationId?: string | null
  /**
   * The acting user's id, or `null` for system-driven grants (the
   * `tools/sysadmin.ts` CLI bootstrapping the first SYSADMIN before
   * any operator exists). UI paths always pass the caller's id via
   * `requireAdmin(ctx.userId)`.
   */
  grantedById: string | null
  reason?: string
}): Promise<{ assignmentId: string; alreadyActive: boolean }> {
  const { userId, roleId, grantedById, reason } = input
  const organizationId = input.organizationId ?? null

  const role = await findRoleById(roleId)
  if (!role) throw new NotFoundError("Role", roleId)

  // Scope enforcement on built-in roles : SYSADMIN is platform-tier
  // only (must be granted with `organizationId === null`) ; ADMIN is
  // org-tier only (must be granted with a non-null org). Custom roles
  // are scoped to a specific org and any assignment must match that
  // org.
  if (role.builtIn) {
    if (role.key === SYSADMIN_ROLE_KEY && organizationId !== null) {
      throw new ValidationError(
        "SYSADMIN is platform-tier only ; assignment must have organizationId = null.",
      )
    }
    if (role.key === ADMIN_ROLE_KEY && organizationId === null) {
      throw new ValidationError(
        "ADMIN is org-tier only ; assignment must declare an organizationId.",
      )
    }
  } else {
    if (role.organizationId === null) {
      throw new ValidationError(
        "Custom roles must declare an organizationId.",
      )
    }
    if (organizationId !== role.organizationId) {
      throw new ValidationError(
        `Role ${role.key} is scoped to a single organization ; assignment orgId must match.`,
      )
    }
  }

  const result = await createAssignment({
    userId,
    roleId,
    organizationId,
    grantedById,
    reason,
  })

  // Skip the audit event when the row was already active — the grant
  // is a no-op and emitting `rbac.role-assigned` would noisily double
  // up subscribers (notification fan-out, audit logs).
  if (result.alreadyActive) {
    return { assignmentId: result.row.id, alreadyActive: true }
  }

  const event: RoleAssignedEvent = {
    type: "rbac.role-assigned",
    assignmentId: result.row.id,
    userId,
    organizationId,
    roleId,
    roleKey: role.key,
    grantedById: grantedById ?? undefined,
    reason,
    occurredAt: new Date(),
  }
  await emit(event)

  return { assignmentId: result.row.id, alreadyActive: false }
}

export async function revokeRole(
  assignmentId: string,
  revokedById: string | null,
  reason?: string,
): Promise<void> {
  const row = await revokeAssignment(assignmentId, revokedById, reason)
  if (!row) return
  const role = await findRoleById(row.roleId)
  const event: RoleRevokedEvent = {
    type: "rbac.role-revoked",
    assignmentId: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    roleId: row.roleId,
    roleKey: role?.key ?? "",
    revokedById: revokedById ?? undefined,
    reason,
    occurredAt: new Date(),
  }
  await emit(event)
}

// ── Role table CRUD ──────────────────────────────────────────────
// Validators (`validateRoleKey` / `validateColor` /
// `validatePermissionList`) live in [validators.ts](./validators.ts)
// so they're unit-testable without a Postgres testcontainer.

export async function createRole(input: {
  organizationId: string
  key: string
  name: string
  description?: string | null
  color?: string | null
  permissions?: string[]
  createdById: string
}): Promise<{ id: string; key: string }> {
  const key = validateRoleKey(input.key)
  const name = input.name.trim()
  if (name.length < 1 || name.length > 80) {
    throw new ValidationError("Role name must be 1–80 characters.")
  }
  const color = validateColor(input.color ?? null)
  const permissions = validatePermissionList(input.permissions ?? [])
  const row = await createCustomRole({
    organizationId: input.organizationId,
    key,
    name,
    description: input.description ?? null,
    color,
    permissions: permissions.map((p) => ({ module: p.module, key: p.key })),
  })
  const event: RoleCreatedEvent = {
    type: "rbac.role-created",
    roleId: row.id,
    roleKey: row.key,
    organizationId: row.organizationId,
    createdById: input.createdById,
    occurredAt: new Date(),
  }
  await emit(event).catch(() => {})
  return { id: row.id, key: row.key }
}

export async function updateRole(input: {
  id: string
  name?: string
  description?: string | null
  color?: string | null
  // When set, replaces the role's permission set wholesale. Built-in
  // ADMIN ignores this list (its permissions are code-enforced) ; we
  // still allow the rows to be written so the UI displays a stable
  // matrix, but they have no effect on `hasPermission`.
  permissions?: string[]
  actorId: string
}): Promise<void> {
  const role = await findRoleById(input.id)
  if (!role) throw new NotFoundError("Role", input.id)

  const patch: {
    name?: string
    description?: string | null
    color?: string | null
    permissions?: Array<{ module: string; key: string }>
  } = {}
  const changed: RoleUpdatedEvent["changed"] = []
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length < 1 || name.length > 80) {
      throw new ValidationError("Role name must be 1–80 characters.")
    }
    if (name !== role.name) {
      patch.name = name
      changed.push("name")
    }
  }
  if (input.description !== undefined) {
    const description = input.description?.trim() ?? null
    if (description !== (role.description ?? null)) {
      patch.description = description
      changed.push("description")
    }
  }
  if (input.color !== undefined) {
    const color = validateColor(input.color)
    if (color !== (role.color ?? null)) {
      patch.color = color
      changed.push("color")
    }
  }
  if (input.permissions !== undefined && !role.builtIn) {
    const validated = validatePermissionList(input.permissions)
    patch.permissions = validated.map((p) => ({ module: p.module, key: p.key }))
    changed.push("permissions")
  }
  if (changed.length === 0) return
  await updateRolePatch({ id: input.id, ...patch })
  const event: RoleUpdatedEvent = {
    type: "rbac.role-updated",
    roleId: input.id,
    organizationId: role.organizationId,
    changed,
    actorId: input.actorId,
    occurredAt: new Date(),
  }
  await emit(event).catch(() => {})
}

export async function deleteRole(input: {
  id: string
  actorId: string
}): Promise<void> {
  const role = await findRoleById(input.id)
  if (!role) throw new NotFoundError("Role", input.id)
  if (role.builtIn) {
    throw new ValidationError("Built-in roles cannot be deleted.")
  }
  // Hard-block if any active assignment exists. The DB-level
  // ON DELETE RESTRICT is the safety net ; we surface a clean
  // ValidationError here so the UI can show a useful message.
  const inUse = await countActiveAssignmentsForRole(input.id)
  if (inUse > 0) {
    throw new ValidationError(
      `Cannot delete a role that is still assigned to ${inUse} user(s). Revoke assignments first.`,
    )
  }
  await deleteRoleRow(input.id)
  const event: RoleDeletedEvent = {
    type: "rbac.role-deleted",
    roleId: input.id,
    organizationId: role.organizationId,
    actorId: input.actorId,
    occurredAt: new Date(),
  }
  await emit(event).catch(() => {})
}
