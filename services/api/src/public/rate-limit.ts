import type { Request, Response, NextFunction } from "express";
import { checkRateLimit } from "@monark/common/rate-limit";
import { env } from "../lib/env";
import { getPrincipal } from "./auth";

// Per-API-key rate limiting for /api/v1, backed by the shared Postgres token
// bucket so the limit holds across every api replica. The sustained rate + burst
// are configured via PUBLIC_API_RATE_PER_SECOND / PUBLIC_API_BURST (defaults 5
// req/s, burst 20). Sets the standard `X-RateLimit-*` + `Retry-After` headers
// and 429s when the bucket is empty.

export async function rateLimit(_req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = getPrincipal(res);
  const result = await checkRateLimit(`api-key:${principal.apiKeyId}`, {
    refillPerSecond: env.PUBLIC_API_RATE_PER_SECOND,
    burst: env.PUBLIC_API_BURST,
  });

  res.setHeader("X-RateLimit-Limit", String(result.limit));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));

  if (!result.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
    res.status(429).json({
      error: { code: "rate_limited", message: "Rate limit exceeded ; slow down and retry." },
    });
    return;
  }

  next();
}
