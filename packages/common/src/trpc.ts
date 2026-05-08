import { initTRPC, TRPCError } from "@trpc/server"
import { AppError } from "./errors"

export interface TrpcContext {
  userId: string | null
  activeOrganizationId: string | null
  requestId: string
}

const t = initTRPC.context<TrpcContext>().create()

// Translates domain AppError codes to tRPC error codes so clients can branch on
// `TRPCClientError.data.code` (e.g. "CONFLICT", "BAD_REQUEST") instead of
// everything surfacing as INTERNAL_SERVER_ERROR.
//
// Exported so the unit suite can lock in the mapping contract
// without piping AppErrors through a real tRPC caller (vite-node
// treats the AppError class loaded via different relative paths as
// different prototypes, so an `instanceof AppError` check inside the
// middleware reads false from the test side ; production goes
// through a single import path and works correctly).
export const APP_TO_TRPC_CODE: Record<string, TRPCError["code"]> = {
  not_found: "NOT_FOUND",
  unauthorized: "UNAUTHORIZED",
  forbidden: "FORBIDDEN",
  validation_error: "BAD_REQUEST",
  conflict: "CONFLICT",
}

const translateAppError = t.middleware(async ({ next }) => {
  try {
    return await next()
  } catch (err) {
    if (err instanceof AppError) {
      throw new TRPCError({
        code: APP_TO_TRPC_CODE[err.code] ?? "INTERNAL_SERVER_ERROR",
        message: err.message,
        cause: err,
      })
    }
    throw err
  }
})

export const router = t.router
export const publicProcedure = t.procedure.use(translateAppError)
export const middleware = t.middleware
export const mergeRouters = t.mergeRouters
export { t }
