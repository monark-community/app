import { ForbiddenError, UnauthorizedError } from "@monark/common"
import type { Permission } from "../contracts/permissions"
import type { Role } from "../contracts/role"
import { hasPermission, hasRole } from "./read"

export type RbacContext = {
  userId: string | null
  activeOrganizationId: string | null
}

function effectiveOrg(ctx: RbacContext, orgId?: string): string | undefined {
  return orgId ?? ctx.activeOrganizationId ?? undefined
}

export async function requireRole(
  ctx: RbacContext,
  role: Role,
  orgId?: string,
): Promise<string> {
  if (!ctx.userId) throw new UnauthorizedError()
  const target = effectiveOrg(ctx, orgId)
  const ok = await hasRole(ctx.userId, role, target)
  if (!ok) throw new ForbiddenError(`Missing required role: ${role}`)
  return ctx.userId
}

export async function requirePermission(
  ctx: RbacContext,
  permission: Permission,
  orgId?: string,
): Promise<string> {
  if (!ctx.userId) throw new UnauthorizedError()
  const target = effectiveOrg(ctx, orgId)
  const ok = await hasPermission(ctx.userId, permission, target)
  if (!ok) throw new ForbiddenError(`Missing required permission: ${permission}`)
  return ctx.userId
}
