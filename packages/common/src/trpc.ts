import { initTRPC } from "@trpc/server"

export interface TrpcContext {
  userId: string | null
  requestId: string
}

const t = initTRPC.context<TrpcContext>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const middleware = t.middleware
export const mergeRouters = t.mergeRouters
export { t }
