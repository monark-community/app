import type { Request, Response } from "express"
import type { TrpcContext } from "@monark/common/trpc"
import { randomUUID } from "node:crypto"

export function createContext({ req }: { req: Request; res: Response }): TrpcContext {
  const requestId = (req.headers["x-request-id"] as string) ?? randomUUID()
  return {
    userId: null,
    activeOrganizationId: null,
    requestId,
  }
}
