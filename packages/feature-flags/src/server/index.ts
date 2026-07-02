import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import { UnauthorizedError } from "@monark/common";
import { requirePermission } from "@monark/rbac/server";
import { isKnownFlag, listFlagKeys, parseFlagKey } from "../contracts/index";
import { getFlags, isEnabled } from "./resolve";
import { readOverridesForFlag } from "./data";
import { setOverride, removeOverride, listFlagDefinitions } from "./write";

const flagKeySchema = z.string().refine(isKnownFlag, { message: "Unknown feature flag key" });

// `roleId` references a row in the `Role` table. The previous
// `role` field was a `Role` enum value ; with the table-driven RBAC
// migration the enum is gone, so role-scoped flag overrides target a
// specific role id (built-in or custom).
const scopeSchema = z
  .object({
    organizationId: z.string().optional(),
    userId: z.string().optional(),
    roleId: z.string().optional(),
  })
  .default({});

export const featureFlagsRouter = router({
  // Flag resolution is needed by any authenticated user for feature-gating
  // (e.g. the authed layout resolving `auth.trusted-devices`) ; it is not an
  // admin surface, so it gates on authentication only. Unauthenticated callers
  // are rejected so flag state can't be probed anonymously.
  get: publicProcedure
    .input(z.object({ key: flagKeySchema, scope: scopeSchema.optional() }))
    .query(({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      return isEnabled(input.key, input.scope);
    }),

  getMany: publicProcedure
    .input(z.object({ keys: z.array(flagKeySchema), scope: scopeSchema.optional() }))
    .query(({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      return getFlags(input.keys, input.scope);
    }),

  // Definition + override listings are operator-facing admin config ; they
  // require the read permission (auto-granted to ADMIN / SYSADMIN).
  listDefinitions: publicProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "feature-flags.read");
    return listFlagDefinitions();
  }),

  listOverrides: publicProcedure
    .input(z.object({ key: flagKeySchema }))
    .query(async ({ ctx, input }) => {
      await requirePermission(ctx, "feature-flags.read");
      const ref = parseFlagKey(input.key);
      if (!ref) return [];
      return readOverridesForFlag(ref);
    }),

  // Mutations gate on the write permission scoped to the override's target
  // org (SYSADMIN / org-ADMIN short-circuit). The actor is derived from the
  // authenticated session, never trusted from the input, so the audit trail
  // can't be forged.
  setOverride: publicProcedure
    .input(
      z.object({
        key: flagKeySchema,
        scope: scopeSchema,
        enabled: z.boolean(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = await requirePermission(
        ctx,
        "feature-flags.write",
        input.scope.organizationId,
      );
      return setOverride(input.key, input.scope, input.enabled, actorId, input.note);
    }),

  removeOverride: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const actorId = await requirePermission(ctx, "feature-flags.write");
      return removeOverride(input.id, actorId);
    }),
});

export { isEnabled, getFlags } from "./resolve";
export { setOverride, removeOverride, listFlagDefinitions } from "./write";
export { syncFlagsToDatabase } from "./sync";
export { listFlagKeys };
export { registerFlags, parseFlagKey, isKnownFlag } from "../contracts/index";
export type { FlagKey, FlagDef, FlagDescriptor, FlagScope } from "../contracts/index";
export { registerFeatureFlagsPermissions } from "./permissions";
export { registerFeatureFlagsEventTypes } from "./event-types";
