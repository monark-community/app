import { z } from "zod"
import { router, publicProcedure } from "@monark/common/trpc"
import { isKnownFlag, listFlagKeys, type FlagKey } from "../contracts/index"
import { getFlags, isEnabled } from "./resolve"
import { readOverridesForFlag } from "./data"
import { setOverride, removeOverride, listFlagDefinitions } from "./write"

const flagKeySchema = z.string().refine(isKnownFlag, { message: "Unknown feature flag key" })

const scopeSchema = z
  .object({
    organizationId: z.string().optional(),
    userId: z.string().optional(),
    role: z.string().optional(),
  })
  .default({})

export const featureFlagsRouter = router({
  get: publicProcedure
    .input(z.object({ key: flagKeySchema, scope: scopeSchema.optional() }))
    .query(({ input }) => isEnabled(input.key as FlagKey, input.scope)),

  getMany: publicProcedure
    .input(z.object({ keys: z.array(flagKeySchema), scope: scopeSchema.optional() }))
    .query(({ input }) => getFlags(input.keys as FlagKey[], input.scope)),

  listDefinitions: publicProcedure.query(() => listFlagDefinitions()),

  listOverrides: publicProcedure
    .input(z.object({ key: flagKeySchema }))
    .query(({ input }) => readOverridesForFlag(input.key as FlagKey)),

  setOverride: publicProcedure
    .input(
      z.object({
        key: flagKeySchema,
        scope: scopeSchema,
        enabled: z.boolean(),
        actorId: z.string(),
        note: z.string().optional(),
      }),
    )
    .mutation(({ input }) =>
      setOverride(input.key, input.scope, input.enabled, input.actorId, input.note),
    ),

  removeOverride: publicProcedure
    .input(z.object({ id: z.string(), actorId: z.string() }))
    .mutation(({ input }) => removeOverride(input.id, input.actorId)),
})

export { isEnabled, getFlags } from "./resolve"
export { setOverride, removeOverride, listFlagDefinitions } from "./write"
export { syncFlagsToDatabase } from "./sync"
export { listFlagKeys }
export type { FlagKey }
