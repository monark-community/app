import type { Request, Response, NextFunction } from "express";
import { authenticateApiKey } from "@monark/api-keys/server";
import type { RoutePrincipal } from "@monark/public-api/server";

// Express middleware that turns an `Authorization: Bearer mrk_…` header into an
// authenticated `RoutePrincipal`, stashed on `res.locals` for the route handler
// (and rate limiter) that run after it. A missing / invalid key is a 401 ; the
// chain stops here.

const PRINCIPAL_KEY = "apiKeyPrincipal";

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) return null;
  return value;
}

// Read the principal set by `apiKeyAuth`. `res.locals` is untyped (Express
// types it loosely), so this is the single, contained cast back to our type ;
// routes are never registered without `apiKeyAuth` ahead of them.
export function getPrincipal(res: Response): RoutePrincipal {
  const principal = (res.locals as Record<string, unknown>)[PRINCIPAL_KEY];
  if (!principal) throw new Error("getPrincipal() called before apiKeyAuth middleware");
  return principal as RoutePrincipal;
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = bearerToken(req.header("authorization"));
  if (!token) {
    res.status(401).json({
      error: {
        code: "unauthorized",
        message: "Provide an API key as `Authorization: Bearer <key>`.",
      },
    });
    return;
  }

  const principal = await authenticateApiKey(token);
  if (!principal) {
    res.status(401).json({
      error: { code: "unauthorized", message: "Invalid, expired, or revoked API key." },
    });
    return;
  }

  (res.locals as Record<string, unknown>)[PRINCIPAL_KEY] = {
    apiKeyId: principal.apiKeyId,
    userId: principal.userId,
    organizationId: principal.organizationId,
    fullAccess: principal.fullAccess,
    permissions: principal.permissions,
  } satisfies RoutePrincipal;
  next();
}
