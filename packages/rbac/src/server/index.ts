import { router, publicProcedure } from "@monark/common/trpc"
import { listPermissions, type Permission } from "../contracts/permissions"
import { getUserRoles, hasPermission, primaryRole } from "./read"

export const rbacRouter = router({
  myRoles: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return []
    return getUserRoles(ctx.userId, ctx.activeOrganizationId ?? undefined)
  }),

  myPrimaryRole: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId || !ctx.activeOrganizationId) return null
    return primaryRole(ctx.userId, ctx.activeOrganizationId)
  }),

  myPermissions: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return []
    const userId = ctx.userId
    const orgId = ctx.activeOrganizationId ?? undefined
    const all = listPermissions()
    const checks = await Promise.all(
      all.map((p) => hasPermission(userId, p, orgId).then((ok) => (ok ? p : null))),
    )
    return checks.filter((p): p is Permission => p !== null)
  }),
})

export { hasRole, hasPermission, getUserRoles, primaryRole, isLastAdmin } from "./read"
export { requireRole, requirePermission, type RbacContext } from "./guards"
export { assignRole, revokeRole } from "./write"
