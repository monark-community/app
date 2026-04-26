import { router, publicProcedure } from "@monark/common/trpc"
import { listPermissions, type Permission } from "../contracts/permissions"
import {
  adminAssignmentSummary,
  getUserRoles,
  hasPermission,
  primaryRole,
} from "./read"

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

  // True when the caller holds any admin-tier role (MONARK_ADMIN platform
  // or org-scoped ADMIN). Used by /admin route guards to bounce non-admins
  // before they see staff-only surfaces.
  isAdmin: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return false
    const summary = await adminAssignmentSummary(ctx.userId)
    return summary.hasAdmin
  }),
})

export {
  hasRole,
  hasPermission,
  getUserRoles,
  primaryRole,
  isLastAdmin,
  adminAssignmentSummary,
} from "./read"
export { requireRole, requirePermission, type RbacContext } from "./guards"
export { assignRole, revokeRole } from "./write"
