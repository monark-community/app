import { ForbiddenError, UnauthorizedError } from "@monark/common"
import type { Permission } from "../contracts/permissions"
import { hasPermission, hasRoleKey } from "./read"

export type RbacContext = {
  userId: string | null
  activeOrganizationId: string | null
}

function effectiveOrg(ctx: RbacContext, orgId?: string): string | undefined {
  return orgId ?? ctx.activeOrganizationId ?? undefined
}

export async function requireRoleKey(
  ctx: RbacContext,
  roleKey: string,
  orgId?: string,
): Promise<string> {
  if (!ctx.userId) throw new UnauthorizedError()
  const target = effectiveOrg(ctx, orgId)
  const ok = await hasRoleKey(ctx.userId, roleKey, target)
  if (!ok) throw new ForbiddenError(`Missing required role: ${roleKey}`)
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
  if (!ok)
    throw new ForbiddenError(`Missing required permission: ${permission}`)
  return ctx.userId
}
