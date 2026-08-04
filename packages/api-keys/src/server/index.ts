import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import { emit, NotFoundError, UnauthorizedError, ValidationError } from "@monark/common";
import { requireOrg } from "@monark/organizations/server";
import { hasPermission, requirePermission } from "@monark/rbac/server";
import type { ApiKeyCreatedEvent, ApiKeyRevokedEvent } from "../contracts/events";
import { serviceAccountsRouter } from "./service-accounts";
import {
  createApiKeyRow,
  findApiKeyByHash,
  findApiKeyForOwner,
  hasKeyPrefix,
  hashKey,
  listApiKeysForOwner,
  mintKey,
  revokeApiKeyRow,
  touchLastUsed,
} from "./data";

/** The authenticated principal behind a presented API key — the shape the
 *  public-API facade turns into a `TrpcContext` for the RBAC guards. */
export interface AuthenticatedApiKey {
  apiKeyId: string;
  /** The principal the key acts as : a user, or a service-account machine row. */
  userId: string;
  organizationId: string;
  /** When false, the key is capped to `permissions` (a subset of the owner's). */
  fullAccess: boolean;
  /** The permission-ceiling allowlist (real RBAC dotted keys) ; empty when fullAccess. */
  permissions: string[];
}

/**
 * Verify a presented plaintext API key. Returns the principal (owner + org) or
 * `null` when the key is unknown / revoked / expired / its principal is
 * deactivated. Stamps `lastUsedAt` (debounced, fire-and-forget). Authorization
 * is NOT decided here — the facade feeds `{ userId, activeOrganizationId }` into
 * the existing RBAC guards, which resolve the principal's roles. There is no
 * separate scope layer : authority is 100% RBAC.
 */
export async function authenticateApiKey(plaintext: string): Promise<AuthenticatedApiKey | null> {
  if (!hasKeyPrefix(plaintext)) return null;
  const row = await findApiKeyByHash(hashKey(plaintext));
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  // The key acts as its owner ; a deactivated principal (a disabled service
  // account or a suspended / deleted user) can no longer authenticate.
  if (row.owner.disabledAt || row.owner.deletedAt) return null;
  void touchLastUsed(row.id, row.lastUsedAt).catch(() => {});
  return {
    apiKeyId: row.id,
    userId: row.ownerUserId,
    organizationId: row.organizationId,
    fullAccess: row.fullAccess,
    permissions: row.permissions,
  };
}

export const apiKeysRouter = router({
  // The caller's own keys in the active org (never the hash).
  list: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "api-keys.manage", org.id);
    return listApiKeysForOwner(org.id, ctx.userId);
  }),

  // Mint a key owned BY THE CALLER (it acts as its creator) in the active org.
  // The plaintext is returned exactly once and never retrievable again. By
  // default the key acts with the owner's full RBAC authority ; `fullAccess:
  // false` caps it to `permissions` — a subset of what the owner holds (an
  // "abstract sub-role"). This is only a CEILING : the live per-request RBAC
  // check still runs against the owner, so the key can never exceed the owner's
  // current grants, and it shrinks automatically if the owner loses a permission.
  create: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(100),
        expiresAt: z.string().datetime().nullable().optional(),
        fullAccess: z.boolean().default(true),
        permissions: z.array(z.string().min(1)).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      const actorId = await requirePermission(ctx, "api-keys.manage", org.id);

      // A limited key must name at least one permission, and every named
      // permission must be one the owner actually holds — you can't grant a key
      // more than you have (the live floor would deny it anyway, but we keep the
      // stored allowlist honest).
      let permissions: string[] = [];
      if (!input.fullAccess) {
        const unique = [...new Set(input.permissions)];
        if (unique.length === 0) {
          throw new ValidationError("A limited key must include at least one permission.");
        }
        const held = await Promise.all(unique.map((p) => hasPermission(ctx.userId!, p, org.id)));
        if (held.some((ok) => !ok)) {
          throw new ValidationError("A selected permission is not one you currently hold.");
        }
        permissions = unique;
      }

      const { plaintext, tokenHash, prefix } = mintKey();
      const row = await createApiKeyRow({
        organizationId: org.id,
        ownerUserId: ctx.userId,
        name: input.name,
        tokenHash,
        prefix,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: actorId,
        fullAccess: input.fullAccess,
        permissions,
      });
      const event: ApiKeyCreatedEvent = {
        type: "api-keys.key-created",
        organizationId: org.id,
        apiKeyId: row.id,
        ownerUserId: ctx.userId,
        actorId,
        occurredAt: new Date(),
      };
      await emit(event);
      // The ONLY moment the plaintext is exposed.
      return { id: row.id, name: row.name, prefix: row.prefix, plaintext };
    }),

  revoke: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      const actorId = await requirePermission(ctx, "api-keys.manage", org.id);
      const row = await findApiKeyForOwner(input.id, org.id, ctx.userId);
      if (!row) throw new NotFoundError("ApiKey", input.id);
      if (!row.revokedAt) {
        await revokeApiKeyRow(row.id);
        const event: ApiKeyRevokedEvent = {
          type: "api-keys.key-revoked",
          organizationId: org.id,
          apiKeyId: row.id,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event);
      }
      return { id: row.id };
    }),

  // v2 : org-owned service accounts (machine principals) + their keys. Admin-
  // gated + flag-gated inside the sub-router.
  serviceAccounts: serviceAccountsRouter,
});

// Boot-time registration helpers (wired in services/api/src/server.ts).
export { registerApiKeysPermissions } from "./permissions";
export { registerApiKeysEventTypes } from "./event-types";
