import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import { emit, UnauthorizedError } from "@monark/common";
import { requireOrg } from "@monark/organizations/server";
import { requirePermission } from "@monark/rbac/server";
import type {
  SecretCreatedEvent,
  SecretDeletedEvent,
  SecretUpdatedEvent,
} from "../contracts/events";
import { deleteSecret, listSecrets, setSecret } from "./data";

// Secret names are env-var style: a letter or underscore, then letters / digits
// / underscores. Uppercase is the convention (GITHUB_TOKEN) but not enforced.
const SECRET_KEY = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    "Use a letter or underscore, then letters, digits, or underscores.",
  );

export const secretsRouter = router({
  // Names + metadata only. This is the ONLY procedure that returns secrets, and
  // it never returns the value or ciphertext (see `listSecrets`' projection).
  adminList: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "secrets.read", org.id);
    return listSecrets(org.id);
  }),

  // Create or update a secret (write-only; the plaintext is never read back).
  // `value` is optional on update — omit it to keep the stored value and only
  // change the description; it's required to create. Emits created / updated
  // with the name + org, never the value.
  adminSet: publicProcedure
    .input(
      z.object({
        key: SECRET_KEY,
        value: z.string().min(1).max(8192).optional(),
        description: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      const actorId = await requirePermission(ctx, "secrets.manage", org.id);
      const { created } = await setSecret({
        organizationId: org.id,
        key: input.key,
        value: input.value,
        description: input.description,
        createdBy: actorId,
      });
      const event: SecretCreatedEvent | SecretUpdatedEvent = {
        type: created ? "secrets.created" : "secrets.updated",
        organizationId: org.id,
        key: input.key,
        actorId,
        occurredAt: new Date(),
      };
      await emit(event);
      return { key: input.key, created };
    }),

  adminDelete: publicProcedure
    .input(z.object({ key: SECRET_KEY }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      const actorId = await requirePermission(ctx, "secrets.manage", org.id);
      const deleted = await deleteSecret(org.id, input.key);
      if (deleted) {
        const event: SecretDeletedEvent = {
          type: "secrets.deleted",
          organizationId: org.id,
          key: input.key,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event);
      }
      return { key: input.key, deleted };
    }),
});

// Server-only data helpers for programmatic use by other core modules
// (`getSecretValue` powers automation's ctx.getSecret; `setSecret` lets a
// bootstrap seed an org's secrets). NEVER expose a decrypted value over tRPC.
export { deleteSecret, getSecretValue, listSecrets, setSecret } from "./data";
export type { SecretSummary } from "./data";
export { registerSecretsPermissions } from "./permissions";
export { registerSecretsEventTypes } from "./event-types";
