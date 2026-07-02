import { ForbiddenError, UnauthorizedError } from "@monark/common";
import { hasPermission, hasRoleKey } from "./read";

export type RbacContext = {
  userId: string | null;
  activeOrganizationId: string | null;
};

function effectiveOrg(ctx: RbacContext, orgId?: string): string | undefined {
  return orgId ?? ctx.activeOrganizationId ?? undefined;
}

export async function requireRoleKey(
  ctx: RbacContext,
  roleKey: string,
  orgId?: string,
): Promise<string> {
  if (!ctx.userId) throw new UnauthorizedError();
  const target = effectiveOrg(ctx, orgId);
  const ok = await hasRoleKey(ctx.userId, roleKey, target);
  if (!ok) throw new ForbiddenError(`Missing required role: ${roleKey}`);
  return ctx.userId;
}

// `dottedPermission` is the merged-registry identity in the form
// `"<module>.<key>"`, e.g. `"organizations.update-settings"` or
// `"posts.publish"`. Extended modules' permissions are accepted the
// same as core's because the registry is built at boot.
export async function requirePermission(
  ctx: RbacContext,
  dottedPermission: string,
  orgId?: string,
): Promise<string> {
  if (!ctx.userId) throw new UnauthorizedError();
  const target = effectiveOrg(ctx, orgId);
  const ok = await hasPermission(ctx.userId, dottedPermission, target);
  if (!ok) {
    throw new ForbiddenError(`Missing required permission: ${dottedPermission}`);
  }
  return ctx.userId;
}
