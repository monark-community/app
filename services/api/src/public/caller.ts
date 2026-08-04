import { randomUUID } from "node:crypto";
import { t } from "@monark/common/trpc";
import { appRouter } from "../trpc/router";

// A server-side tRPC caller over the full app router. The public REST facade
// is a thin adapter : it authenticates an API key, synthesizes the exact
// `{ userId, activeOrganizationId }` context a normal session would have, and
// invokes the SAME procedures the web app uses. All RBAC, per-record access,
// event emission, and validation are reused verbatim — the facade never
// re-implements authorization.
const createCaller = t.createCallerFactory(appRouter);

export type AppCaller = ReturnType<typeof createCaller>;

export function makeCaller(principal: { userId: string; organizationId: string }): AppCaller {
  return createCaller({
    userId: principal.userId,
    activeOrganizationId: principal.organizationId,
    requestId: randomUUID(),
  });
}
