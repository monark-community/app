import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import {
  emit,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@monark/common";
import { adminAssignmentSummary, requirePermission } from "@monark/rbac/server";
import { getById as getUserById } from "@monark/users/server";
import type { OrganizationUpdatedEvent } from "../contracts/events";
import {
  findById,
  listOrganizationsForAdmin,
  listPendingInvitesForAdmin,
  listPendingInvitesForOrg,
  updateOrganizationForAdmin,
} from "./data";
import { consumePendingInvitesForUser, createInvite, revokeInvite } from "./invites";
import { ensureSingletonOrganizationFromInput, getBootstrapStatus } from "./bootstrap";
import { getCurrentOrg, getUserOrgs } from "./read";
import {
  deleteOrganizationMetadataValue,
  getOrganizationMetadataValue,
  listOrganizationMetadataForModule,
  setOrganizationMetadataValue,
} from "./metadata";

// Mirror of the rbac.isAdmin gate the /admin layout uses, scoped to the
// `organizations.admin*` procedures. Non-admins get FORBIDDEN before
// they reach the data layer.
async function requireAdmin(userId: string | null): Promise<string> {
  if (!userId) throw new UnauthorizedError();
  const summary = await adminAssignmentSummary(userId);
  if (!summary.hasAdmin) throw new ForbiddenError("Admin role required.");
  return userId;
}

// Accepted slug shape : lowercase letters, digits, dashes ; 2–60 chars.
// Same lane as a typical URL-segment slug ; no spaces, no leading/trailing
// dash. Conservative on purpose so we don't accidentally let through
// values that conflict with route segments (`new`, `admin`, etc. are
// caller-domain to validate).
const SLUG_SCHEMA = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "invalid_slug");

// Hex color validator covering #RGB / #RRGGBB shapes. Stays lenient on
// case so the UI can render whatever the brand picker produces.
const HEX_COLOR_SCHEMA = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "invalid_color");

const adminUpdateInput = z.object({
  id: z.string().min(1),
  displayName: z.string().trim().min(1).max(120).optional(),
  slug: SLUG_SCHEMA.optional(),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: HEX_COLOR_SCHEMA.nullable().optional(),
});

export const organizationsRouter = router({
  current: publicProcedure.query(({ ctx }) =>
    getCurrentOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    }),
  ),

  mine: publicProcedure.query(({ ctx }) => {
    if (!ctx.userId) return [];
    return getUserOrgs(ctx.userId);
  }),

  // Bootstrap status for the /setup page + the (anon)/(authed) layout
  // gates. Public on purpose : the gate has to read this before it
  // knows whether the request can proceed, and the response carries no
  // sensitive info (the count of active orgs is at most ambient
  // metadata). Multi-tenant mode always reports `bootstrapped: true`.
  bootstrapStatus: publicProcedure.query(() => getBootstrapStatus()),

  // Self-healing bootstrap. Public on purpose : the gate inside
  // `ensureSingletonOrganizationFromInput` refuses unless tenancy is
  // single AND no org exists yet, so this can't be abused to spawn
  // extra orgs at runtime — the worst a hostile caller can do is
  // re-trigger the same env-driven creation that boot already runs.
  // The /setup page polls this on every stuck tick so a missed
  // boot-time hook (race, transient DB error, env vars set after the
  // server was already up) doesn't require a container restart to
  // recover from. Input is fully optional ; when missing we fall back
  // to the API process's `INITIAL_ORG_*` env vars (the canonical
  // single-tenant deploy contract). Reading `process.env` directly
  // from the package is unusual but appropriate here : this is the
  // boot/setup primitive, and the env-var contract is part of the
  // public API of single-tenant mode.
  ensureBootstrap: publicProcedure
    .input(
      z
        .object({
          slug: z.string().nullable().optional(),
          displayName: z.string().nullable().optional(),
          primaryColor: z.string().nullable().optional(),
          logoUrl: z.string().url().nullable().optional(),
        })
        .optional(),
    )
    .mutation(({ input }) =>
      ensureSingletonOrganizationFromInput({
        slug: input?.slug ?? process.env.INITIAL_ORG_SLUG ?? null,
        displayName: input?.displayName ?? process.env.INITIAL_ORG_NAME ?? null,
        primaryColor: input?.primaryColor ?? process.env.INITIAL_ORG_PRIMARY_COLOR ?? null,
        logoUrl: input?.logoUrl ?? null,
        actorId: "system:bootstrap",
      }),
    ),

  // Cursor-paginated org listing for /admin/organizations. Mirrors the
  // shape of `users.adminListUsers` so the admin list pages can share
  // a single rendering pattern.
  adminList: publicProcedure
    .input(
      z.object({
        search: z.string().trim().max(120).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId);
      return listOrganizationsForAdmin({
        search: input.search,
        cursor: input.cursor,
        limit: input.limit,
      });
    }),

  adminGet: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId);
      const org = await findById(input.id);
      if (!org) throw new NotFoundError("Organization", input.id);
      return org;
    }),

  // Partial update on the org profile : displayName / slug / logoUrl /
  // primaryColor. Slug rotations record an `OrgSlugRedirect` row on the
  // way out (90-day expiry) so existing links keep resolving. Throws
  // ValidationError when the new slug collides with another org ;
  // surfaces a clean error rather than the underlying unique-constraint
  // violation.
  adminUpdate: publicProcedure.input(adminUpdateInput).mutation(async ({ ctx, input }) => {
    const actorId = await requireAdmin(ctx.userId);
    const { id, ...patch } = input;
    try {
      const result = await updateOrganizationForAdmin(id, patch);
      const changed: OrganizationUpdatedEvent["changed"] = [];
      if (patch.displayName !== undefined) changed.push("displayName");
      if (patch.slug !== undefined) changed.push("slug");
      if (patch.logoUrl !== undefined) changed.push("logoUrl");
      if (patch.primaryColor !== undefined) changed.push("primaryColor");
      if (changed.length > 0) {
        const event: OrganizationUpdatedEvent = {
          type: "organization.updated",
          organizationId: id,
          actorId,
          changed,
          previousSlug: result.previousSlug,
          occurredAt: new Date(),
        };
        await emit(event).catch(() => {});
      }
      return result.row;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Slug already in use") {
          throw new ValidationError("That slug is already taken.");
        }
        if (error.message.endsWith("not found")) {
          throw new NotFoundError("Organization", id);
        }
      }
      throw error;
    }
  }),

  // Invite-flow procedures. Live under the organizations router (vs a
  // dedicated `invites` router) because the surface is intrinsically
  // org-scoped : you invite *into* an org, not in isolation.
  invites: router({
    adminList: publicProcedure
      .input(z.object({ organizationId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        return listPendingInvitesForOrg(input.organizationId);
      }),

    // Org-agnostic pending-invite list. Drives the "Pending" rows that
    // render inline in the admin /admin/users directory ; replaces the
    // dedicated /admin/invites page that was retired in favour of the
    // unified directory. `roleIds` filters to specific role rows.
    adminListAll: publicProcedure
      .input(
        z
          .object({
            search: z.string().trim().max(120).optional(),
            roleIds: z.array(z.string().min(1)).optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        return listPendingInvitesForAdmin({
          search: input?.search,
          roleIds: input?.roleIds,
        });
      }),

    // Generates a fresh invite, fires the email, returns the row +
    // plaintext token + signUp URL. The token is shown to the admin
    // once (in case the email never arrives) ; subsequent reads of
    // the row never expose it since only the hash is stored.
    adminCreate: publicProcedure
      .input(
        z.object({
          organizationId: z.string().min(1),
          email: z.string().email(),
          // Optional pre-fill for the recipient's display name. Trimmed
          // and treated as null when empty so the data layer doesn't
          // store empty strings.
          displayName: z.string().trim().max(120).optional(),
          roleId: z.string().min(1),
          // Optional override so the email link points back at the
          // host the admin triggered this from (LAN testing / preview
          // deployments). Web layer reads from the request Host.
          appUrl: z.string().url().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const actorId = await requireAdmin(ctx.userId);
        return createInvite({
          organizationId: input.organizationId,
          email: input.email,
          displayName: input.displayName || null,
          roleId: input.roleId,
          invitedById: actorId,
          appUrl: input.appUrl ?? "http://localhost:3000",
        });
      }),

    adminRevoke: publicProcedure
      .input(z.object({ inviteId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        await revokeInvite(input.inviteId);
      }),

    // Auto-accept hook fired right after sign-in / signup. Walks every
    // pending invite that targets the caller's email and applies the
    // implied membership + role assignment. Idempotent : an invite
    // that's already accepted is a no-op, so the web layer can call
    // this on every notifySignedIn without bookkeeping. Returns the
    // count for an optional toast.
    consumePending: publicProcedure.mutation(async ({ ctx }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const user = await getUserById(ctx.userId);
      if (!user) return { accepted: 0 };
      return consumePendingInvitesForUser(ctx.userId, user.email);
    }),
  }),

  // ── Generic metadata sidecar ────────────────────────────────────
  // Same shape as @monark/users.metadata, scoped to an org. Reads
  // require either org membership OR
  // `organizations.read-metadata-for-module-<module>` ; writes always
  // require `organizations.write-metadata-for-module-<module>`.
  metadata: router({
    list: publicProcedure
      .input(
        z.object({
          organizationId: z.string().min(1),
          module: z.string().min(1),
        }),
      )
      .query(async ({ ctx, input }) => {
        await requirePermission(
          ctx,
          `organizations.read-metadata-for-module-${input.module}`,
          input.organizationId,
        );
        return listOrganizationMetadataForModule(input.organizationId, input.module);
      }),

    get: publicProcedure
      .input(
        z.object({
          organizationId: z.string().min(1),
          module: z.string().min(1),
          key: z.string().min(1),
        }),
      )
      .query(async ({ ctx, input }) => {
        await requirePermission(
          ctx,
          `organizations.read-metadata-for-module-${input.module}`,
          input.organizationId,
        );
        return getOrganizationMetadataValue(input.organizationId, input.module, input.key);
      }),

    set: publicProcedure
      .input(
        z.object({
          organizationId: z.string().min(1),
          module: z.string().min(1),
          key: z.string().min(1),
          value: z.unknown(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requirePermission(
          ctx,
          `organizations.write-metadata-for-module-${input.module}`,
          input.organizationId,
        );
        return setOrganizationMetadataValue({
          organizationId: input.organizationId,
          module: input.module,
          key: input.key,
          value: input.value,
        });
      }),

    delete: publicProcedure
      .input(
        z.object({
          organizationId: z.string().min(1),
          module: z.string().min(1),
          key: z.string().min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requirePermission(
          ctx,
          `organizations.write-metadata-for-module-${input.module}`,
          input.organizationId,
        );
        await deleteOrganizationMetadataValue(input.organizationId, input.module, input.key);
      }),
  }),
});

export {
  getById,
  getByIdOrThrow,
  getBySlug,
  getUserOrgs,
  getCurrentOrg,
  requireOrg,
  type Organization,
  type OrgSessionContext,
} from "./read";
export { acceptInviteByToken, consumePendingInvitesForUser } from "./invites";
export {
  bootstrapSingletonOrganization,
  ensureSingletonOrganizationFromInput,
  getBootstrapStatus,
  getSingletonOrganization,
  type BootstrapStatus,
  type EnsureBootstrapResult,
  type InitialOrgInput,
} from "./bootstrap";
export { isMember } from "./data";
export { registerOrganizationsFeatureFlags } from "./flags";
export { registerOrganizationsPermissions } from "./permissions";
export { registerOrganizationsEventTypes } from "./event-types";
export { ensureSingletonMembership, registerOrganizationsSubscribers } from "./auto-membership";
export {
  listOrganizationMetadataForModule,
  getOrganizationMetadataValue,
  setOrganizationMetadataValue,
  deleteOrganizationMetadataValue,
  deleteOrganizationMetadataForModule,
  type OrganizationMetadataRow,
} from "./metadata";
