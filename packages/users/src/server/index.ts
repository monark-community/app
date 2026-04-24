import { router, publicProcedure } from "@monark/common/trpc"
import { getCurrent } from "./read"

export const usersRouter = router({
  me: publicProcedure.query(({ ctx }) => getCurrent({ userId: ctx.userId })),
})

export { getById, getByIdOrThrow, getByEmail, getCurrent, type User } from "./read"
