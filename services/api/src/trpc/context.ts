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
    clientIp: clientIpOf(req),
  };
}

// Best-effort client IP for rate-limiting. Behind a proxy/load balancer the
// real client is the first entry of `X-Forwarded-For` ; falls back to the
// socket address. Never trusted for authz — only used as a rate-limit key.
function clientIpOf(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  const first = raw?.split(",")[0]?.trim();
  return first || req.ip || req.socket?.remoteAddress || null;
}
