import type { Request, Response } from "express";
import type { TrpcContext } from "@monark/common/trpc";
import { randomUUID } from "node:crypto";
import { verifyAccessToken } from "../lib/supabase";

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const [scheme, value] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) return null;
  return value;
}

export async function createContext({
  req,
}: {
  req: Request;
  res: Response;
}): Promise<TrpcContext> {
  const requestId = (req.headers["x-request-id"] as string) ?? randomUUID();
  const token = bearerToken(req.headers.authorization);
  const session = token ? await verifyAccessToken(token) : null;

  return {
    userId: session?.userId ?? null,
    activeOrganizationId: session?.activeOrganizationId ?? null,
    requestId,
  };
}
