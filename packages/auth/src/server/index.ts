import { router, publicProcedure } from "@monark/common/trpc"

// Public surface of @monark/auth/server.
// Export the tRPC sub-router as `authRouter` so gen:routers picks it up.
export const authRouter = router({
  ping: publicProcedure.query(() => ({
    pong: true,
    at: new Date().toISOString(),
  })),
})
