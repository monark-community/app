import type { Express, Request, Response, RequestHandler } from "express";
import { logger } from "@monark/common";
import { isEnabled } from "@monark/feature-flags/server";
import { buildOpenApiSpec, PUBLIC_API_ENABLED_FLAG } from "@monark/public-api/server";
import { V1_ROUTES } from "./routes";
import { apiKeyAuth, getPrincipal } from "./auth";
import { rateLimit } from "./rate-limit";
import { makeCaller } from "./caller";

const BASE = "/api/v1";

// tRPC error codes → HTTP status. The caller wraps domain AppErrors into
// TRPCErrors (via the `translateAppError` middleware), so we prefer the
// original AppError's own `statusCode` when it survives as `.cause`.
const TRPC_STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  TOO_MANY_REQUESTS: 429,
};

// Error classification is done by SHAPE, not `instanceof` : the error can cross
// package boundaries (a domain error thrown inside a tRPC procedure, re-wrapped
// by the caller), and a monorepo can end up with more than one copy of a class
// (@trpc/server, @monark/common) in its module graph — so `instanceof` is not
// reliable at this boundary. Ducking on stable fields (`name`, `code`,
// `statusCode`, `issues`) maps every case correctly regardless of which module
// instance minted the error.

function zodIssues(err: unknown): Array<{ path: (string | number)[]; message: string }> | null {
  if (err && typeof err === "object" && (err as { name?: unknown }).name === "ZodError") {
    const issues = (err as { issues?: unknown }).issues;
    if (Array.isArray(issues))
      return issues as Array<{ path: (string | number)[]; message: string }>;
  }
  return null;
}

// The stable shape of a domain AppError : a string `code` + numeric `statusCode`.
function appErrorShape(err: unknown): { code: string; statusCode: number; message: string } | null {
  if (!err || typeof err !== "object") return null;
  const code = (err as { code?: unknown }).code;
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  if (typeof code === "string" && typeof statusCode === "number") {
    const raw = (err as { message?: unknown }).message;
    return { code, statusCode, message: typeof raw === "string" ? raw : "" };
  }
  return null;
}

function trpcErrorShape(err: unknown): { code: string; message: string; cause: unknown } | null {
  if (!err || typeof err !== "object") return null;
  if ((err as { name?: unknown }).name !== "TRPCError") return null;
  const code = (err as { code?: unknown }).code;
  const raw = (err as { message?: unknown }).message;
  return {
    code: typeof code === "string" ? code : "INTERNAL_SERVER_ERROR",
    message: typeof raw === "string" ? raw : "",
    cause: (err as { cause?: unknown }).cause,
  };
}

function sendError(res: Response, err: unknown): void {
  const issues = zodIssues(err);
  if (issues) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
      },
    });
    return;
  }

  const trpc = trpcErrorShape(err);
  if (trpc) {
    // Prefer the wrapped domain error's own status/code/message when it survived.
    const cause = appErrorShape(trpc.cause);
    const status = cause?.statusCode ?? TRPC_STATUS[trpc.code] ?? 500;
    const code = cause?.code ?? trpc.code.toLowerCase();
    res.status(status).json({ error: { code, message: cause?.message ?? trpc.message } });
    return;
  }

  const app = appErrorShape(err);
  if (app) {
    res.status(app.statusCode).json({ error: { code: app.code, message: app.message } });
    return;
  }

  logger.error({ err }, "public api handler failed");
  res.status(500).json({ error: { code: "internal", message: "Internal error." } });
}

function notFound(res: Response): void {
  res.status(404).json({ error: { code: "not_found", message: "Not found." } });
}

/**
 * Mount the curated public REST API at /api/v1. Every route is
 * `apiKeyAuth → rateLimit → (flag gate → validate → tRPC caller, which enforces RBAC)`.
 * The OpenAPI doc is unauthenticated (for discovery) but still flag-gated.
 * Call after `express.json()` is registered on `app`.
 */
export function mountPublicApi(app: Express): void {
  app.get(`${BASE}/openapi.json`, async (_req: Request, res: Response) => {
    if (!(await isEnabled(PUBLIC_API_ENABLED_FLAG, {}))) {
      notFound(res);
      return;
    }
    res.json(
      buildOpenApiSpec(V1_ROUTES, {
        title: "Monark Public API",
        version: "1.0.0",
        description:
          "Curated REST access to a Monark organization's Data Models and records, authenticated with an `mrk_` API key.",
        serverUrl: BASE,
      }),
    );
  });

  for (const route of V1_ROUTES) {
    const handler: RequestHandler = async (req, res) => {
      try {
        const principal = getPrincipal(res);
        // Per-request kill switch, resolved in the caller's context so an
        // org / user / role override applies. A disabled deploy 404s (reveals
        // nothing) even for a valid key.
        const enabled = await isEnabled(PUBLIC_API_ENABLED_FLAG, {
          userId: principal.userId,
          organizationId: principal.organizationId,
        });
        if (!enabled) {
          notFound(res);
          return;
        }

        // Per-key permission ceiling. A key with `fullAccess: false` may only
        // reach routes whose required permission is in its allowlist — an
        // "abstract sub-role" over the owner's authority. This CAPS the key
        // (independent of the owner's roles, so it caps admins too) ; the live
        // RBAC floor still runs in the procedure below against the owner.
        if (
          !principal.fullAccess &&
          route.permission &&
          !principal.permissions.includes(route.permission)
        ) {
          res.status(403).json({
            error: {
              code: "forbidden",
              message: `This API key is not permitted to ${route.permission}.`,
            },
          });
          return;
        }

        const query = route.request?.query ? route.request.query.parse(req.query) : req.query;
        const body = route.request?.body ? route.request.body.parse(req.body) : req.body;
        const caller = makeCaller({
          userId: principal.userId,
          organizationId: principal.organizationId,
        });

        const result = await route.handler({
          caller,
          principal,
          params: req.params as Record<string, string>,
          query,
          body,
        });

        if (result === undefined) {
          res.status(204).end();
          return;
        }
        res.json(result);
      } catch (err) {
        sendError(res, err);
      }
    };

    const path = `${BASE}${route.path}`;
    // Direct per-method registration keeps Express's overload typing happy
    // (binding `app.get` collides with its settings-getter overload).
    switch (route.method) {
      case "get":
        app.get(path, apiKeyAuth, rateLimit, handler);
        break;
      case "post":
        app.post(path, apiKeyAuth, rateLimit, handler);
        break;
      case "patch":
        app.patch(path, apiKeyAuth, rateLimit, handler);
        break;
      case "delete":
        app.delete(path, apiKeyAuth, rateLimit, handler);
        break;
    }
  }
}
