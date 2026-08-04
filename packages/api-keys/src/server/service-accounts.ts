import { randomBytes } from "node:crypto";
import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import {
  emit,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@monark/common";
import { getDb } from "@monark/db";
import { requireOrg } from "@monark/organizations/server";
import { assignRole, listRolesForOrg, requirePermission, revokeRole } from "@monark/rbac/server";
import { isEnabled } from "@monark/feature-flags/server";
import type {
  ApiKeyCreatedEvent,
  ApiKeyRevokedEvent,
  ServiceAccountCreatedEvent,
  ServiceAccountDisabledEvent,
} from "../contracts/events";
import {
  createApiKeyRow,
  findApiKeyForOwner,
  listApiKeysForOwner,
  mintKey,
  revokeApiKeyRow,
} from "./data";

// v2 of the public API : org-owned SERVICE accounts (machine principals) whose
// keys act as the account, not as a person. A service account is a flagged
// `User` row (kind = SERVICE) + a membership + its own RBAC roles, so it flows
// through the existing RBAC / caller / key machinery unchanged. See
// docs/features-planning/phase-3/public-api-service-accounts.md.

// Registered by @monark/public-api (registerPublicApiFeatureFlags). Checked by
// dotted key to avoid a dependency cycle (public-api already depends on
// api-keys). Off by default so v2 ships dark independently of the user-key API.
const SERVICE_ACCOUNTS_FLAG = "public-api.service-accounts";

async function assertEnabled(
  ctx: { userId: string | null },
  organizationId: string,
): Promise<void> {
  const on = await isEnabled(SERVICE_ACCOUNTS_FLAG, {
    userId: ctx.userId ?? undefined,
    organizationId,
  });
  if (!on) throw new ForbiddenError("Service accounts are not enabled for this organization.");
}

// A machine user id is minted by us with a `svc_` prefix : it is never a valid
// Supabase auth subject (so it can never back a real session) and reads
// unmistakably in logs / attribution.
function mintServiceAccountId(): string {
  return `svc_${randomBytes(16).toString("hex")}`;
}

// The roles a service account is granted must belong to the org (or be a global
// built-in). Validated up front so `create` doesn't half-provision on a bad id.
async function assertRolesAssignable(organizationId: string, roleIds: string[]): Promise<void> {
  if (roleIds.length === 0) return;
  const found = await getDb().role.findMany({
    where: { id: { in: roleIds }, OR: [{ organizationId }, { organizationId: null }] },
    select: { id: true },
  });
  if (found.length !== new Set(roleIds).size) {
    throw new ValidationError("One or more roles are not assignable in this organization.");
  }
}

// Confirm an id names a live SERVICE account in this org ; throws 404 otherwise
// (never leaks that a machine row exists in another org).
async function requireServiceAccount(id: string, organizationId: string) {
  const row = await getDb().user.findFirst({
    where: { id, kind: "SERVICE", memberships: { some: { organizationId } } },
    select: { id: true, displayName: true, disabledAt: true },
  });
  if (!row) throw new NotFoundError("ServiceAccount", id);
  return row;
}

const nameSchema = z.string().trim().min(1).max(100);

export const serviceAccountsRouter = router({
  // Every service account in the caller's org, with its roles + key count.
  list: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "api-keys.manage-service-accounts", org.id);
    await assertEnabled(ctx, org.id);

    const rows = await getDb().user.findMany({
      where: { kind: "SERVICE", memberships: { some: { organizationId: org.id } } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        displayName: true,
        disabledAt: true,
        createdAt: true,
        createdBy: true,
        roleAssignments: {
          where: { organizationId: org.id, revokedAt: null },
          select: { roleId: true },
        },
        _count: { select: { apiKeys: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.displayName ?? r.id,
      disabledAt: r.disabledAt,
      createdAt: r.createdAt,
      createdBy: r.createdBy,
      roleIds: r.roleAssignments.map((a) => a.roleId),
      keyCount: r._count.apiKeys,
    }));
  }),

  // The roles an admin can grant a service account (the org's custom roles +
  // grantable built-ins) — drives the create / edit role picker. Resolves the
  // org from ctx so the client needs no org id.
  assignableRoles: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "api-keys.manage-service-accounts", org.id);
    await assertEnabled(ctx, org.id);
    const roles = await listRolesForOrg(org.id);
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      key: r.key,
      color: r.color,
      builtIn: r.builtIn,
    }));
  }),

  // Provision a machine principal : a SERVICE user + a membership in the org +
  // its granted roles. Returns the new account's id.
  create: publicProcedure
    .input(z.object({ name: nameSchema, roleIds: z.array(z.string().min(1)).default([]) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      const actorId = await requirePermission(ctx, "api-keys.manage-service-accounts", org.id);
      await assertEnabled(ctx, org.id);
      await assertRolesAssignable(org.id, input.roleIds);

      const id = mintServiceAccountId();
      const db = getDb();
      await db.user.create({
        data: {
          id,
          kind: "SERVICE",
          displayName: input.name,
          // `.invalid` is reserved (RFC 2606) : never deliverable, never collides
          // with a real signup. Dispatch also short-circuits on kind = SERVICE.
          email: `${id}@service.invalid`,
          createdBy: actorId,
        },
      });
      await db.organizationMembership.create({ data: { userId: id, organizationId: org.id } });
      for (const roleId of input.roleIds) {
        await assignRole({ userId: id, roleId, organizationId: org.id, grantedById: actorId });
      }

      const event: ServiceAccountCreatedEvent = {
        type: "api-keys.service-account-created",
        organizationId: org.id,
        serviceAccountId: id,
        name: input.name,
        roleIds: input.roleIds,
        actorId,
        occurredAt: new Date(),
      };
      await emit(event);

      return { id, name: input.name, roleIds: input.roleIds };
    }),

  // Replace a service account's role set (diff against the current active grants).
  setRoles: publicProcedure
    .input(z.object({ id: z.string().min(1), roleIds: z.array(z.string().min(1)) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      const actorId = await requirePermission(ctx, "api-keys.manage-service-accounts", org.id);
      await assertEnabled(ctx, org.id);
      await requireServiceAccount(input.id, org.id);
      await assertRolesAssignable(org.id, input.roleIds);

      const current = await getDb().roleAssignment.findMany({
        where: { userId: input.id, organizationId: org.id, revokedAt: null },
        select: { id: true, roleId: true },
      });
      const currentRoleIds = new Set(current.map((a) => a.roleId));
      const target = new Set(input.roleIds);
      for (const a of current) {
        if (!target.has(a.roleId)) await revokeRole(a.id, actorId);
      }
      for (const roleId of input.roleIds) {
        if (!currentRoleIds.has(roleId)) {
          await assignRole({
            userId: input.id,
            roleId,
            organizationId: org.id,
            grantedById: actorId,
          });
        }
      }
      return { id: input.id, roleIds: input.roleIds };
    }),

  // Disable a service account : stamps `disabledAt`, so `authenticateApiKey`
  // rejects all of its keys (no row-level revoke needed).
  disable: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      const actorId = await requirePermission(ctx, "api-keys.manage-service-accounts", org.id);
      await assertEnabled(ctx, org.id);
      const account = await requireServiceAccount(input.id, org.id);
      if (!account.disabledAt) {
        await getDb().user.update({ where: { id: input.id }, data: { disabledAt: new Date() } });
        const event: ServiceAccountDisabledEvent = {
          type: "api-keys.service-account-disabled",
          organizationId: org.id,
          serviceAccountId: input.id,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event);
      }
      return { id: input.id };
    }),

  // Permanently delete a service account ; FK cascade removes its keys,
  // membership, and role assignments.
  delete: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "api-keys.manage-service-accounts", org.id);
      await assertEnabled(ctx, org.id);
      await requireServiceAccount(input.id, org.id);
      await getDb().user.delete({ where: { id: input.id } });
      return { id: input.id };
    }),

  // A service account's keys : same mint-once / list / revoke as the self-serve
  // surface, but owned by the machine principal (`ownerUserId = accountId`).
  keys: router({
    list: publicProcedure
      .input(z.object({ serviceAccountId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "api-keys.manage-service-accounts", org.id);
        await assertEnabled(ctx, org.id);
        await requireServiceAccount(input.serviceAccountId, org.id);
        return listApiKeysForOwner(org.id, input.serviceAccountId);
      }),

    create: publicProcedure
      .input(
        z.object({
          serviceAccountId: z.string().min(1),
          name: nameSchema,
          expiresAt: z.string().datetime().nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const actorId = await requirePermission(ctx, "api-keys.manage-service-accounts", org.id);
        await assertEnabled(ctx, org.id);
        const account = await requireServiceAccount(input.serviceAccountId, org.id);
        if (account.disabledAt) {
          throw new ValidationError("Cannot mint a key for a disabled service account.");
        }

        const { plaintext, tokenHash, prefix } = mintKey();
        const row = await createApiKeyRow({
          organizationId: org.id,
          ownerUserId: input.serviceAccountId,
          name: input.name,
          tokenHash,
          prefix,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdBy: actorId,
        });
        const event: ApiKeyCreatedEvent = {
          type: "api-keys.key-created",
          organizationId: org.id,
          apiKeyId: row.id,
          ownerUserId: input.serviceAccountId,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event);
        // The ONLY moment the plaintext is exposed.
        return { id: row.id, name: row.name, prefix: row.prefix, plaintext };
      }),

    revoke: publicProcedure
      .input(z.object({ serviceAccountId: z.string().min(1), keyId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const actorId = await requirePermission(ctx, "api-keys.manage-service-accounts", org.id);
        await assertEnabled(ctx, org.id);
        await requireServiceAccount(input.serviceAccountId, org.id);
        const row = await findApiKeyForOwner(input.keyId, org.id, input.serviceAccountId);
        if (!row) throw new NotFoundError("ApiKey", input.keyId);
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
  }),
});
