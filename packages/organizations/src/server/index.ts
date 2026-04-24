import { router, publicProcedure } from "@monark/common/trpc"
import { getCurrentOrg, getUserOrgs } from "./read"

export const organizationsRouter = router({
  current: publicProcedure.query(({ ctx }) =>
    getCurrentOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    }),
  ),

  mine: publicProcedure.query(({ ctx }) => {
    if (!ctx.userId) return []
    return getUserOrgs(ctx.userId)
  }),
})

export {
  getById,
  getByIdOrThrow,
  getBySlug,
  getUserOrgs,
  getCurrentOrg,
  requireOrg,
  type Organization,
  type OrgSessionContext,
} from "./read"
