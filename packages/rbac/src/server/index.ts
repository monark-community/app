import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@monark/common";
import { getDb } from "@monark/db";
import {
  getPermissionDef,
  isKnownPermission,
  listPermissions,
  permissionsByCategory,
  type Permission,
} from "../contracts/permissions";
import { SYSADMIN_ROLE_KEY } from "../contracts/role";
import { findRoleById, hasSysadminAssignment, listRolesForOrg, listSysadmins } from "./data";
import { adminAssignmentSummary, getUserRoles, hasPermission } from "./read";
import { assignRole, createRole, deleteRole, revokeRole, updateRole } from "./write";

// Mirror of the rbac.isAdmin gate the /admin layout uses, scoped to the
// `rbac.admin*` procedures so a non-admin can't grant or revoke roles
// even with a hand-crafted tRPC call.
async function requireAdmin(userId: string | null): Promise<string> {
  if (!userId) throw new UnauthorizedError();
  const summary = await adminAssignmentSummary(userId);
  if (!summary.hasAdmin) throw new ForbiddenError("Admin role required.");
  return userId;
}

const permissionKeySchema = z
  .string()
  .min(1)
  .refine(isKnownPermission, { message: "Unknown permission key" });

export const rbacRouter = router({
  myRoles: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return [];
    // Same org-fallback pattern as myPermissions: server-side calls don't
    // forward activeOrganizationId, so resolve from membership when absent.
    let orgId: string | undefined = ctx.activeOrganizationId ?? undefined;
    if (!orgId) {
      const membership = await getDb().organizationMembership.findFirst({
        where: { userId: ctx.userId },
        select: { organizationId: true },
        orderBy: { joinedAt: "asc" },
      });
      orgId = membership?.organizationId ?? undefined;
    }
    return getUserRoles(ctx.userId, orgId);
  }),

  myPermissions: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return [];
    const userId = ctx.userId;
    // Server-side tRPC calls (Next.js page components) don't forward the
    // activeOrganizationId header, so ctx.activeOrganizationId is null.
    // Fall back to the user's earliest org membership so permission checks
    // can resolve org-scoped role assignments in single-tenant setups.
    let orgId: string | undefined = ctx.activeOrganizationId ?? undefined;
    if (!orgId) {
      const membership = await getDb().organizationMembership.findFirst({
        where: { userId },
        select: { organizationId: true },
        orderBy: { joinedAt: "asc" },
      });
      orgId = membership?.organizationId ?? undefined;
    }
    const all = listPermissions();
    const checks = await Promise.all(
      all.map((p) => hasPermission(userId, p, orgId).then((ok) => (ok ? p : null))),
    );
    return checks.filter((p): p is Permission => p !== null);
  }),

  // True when the caller holds any active built-in ADMIN assignment
  // (platform-tier or any org). Used by /admin route guards.
  isAdmin: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return false;
    const summary = await adminAssignmentSummary(ctx.userId);
    return summary.hasAdmin;
  }),

  // True when the caller specifically holds an active platform-tier
  // SYSADMIN assignment. Stricter than `isAdmin` (which lights up for
  // org-tier ADMIN too) ; gates surfaces that are platform-only, like
  // the webhook editor's scope field and the platform-tier endpoint
  // slot in the org picker.
  isSysadmin: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return false;
    return hasSysadminAssignment(ctx.userId);
  }),

  // ── Dev-only: promote / demote self ──────────────────────────
  // Bypasses the admin guard entirely so a fresh dev environment can
  // bootstrap itself without a CLI step. Throws in production.
  devToggleSysadmin: publicProcedure.mutation(async ({ ctx }) => {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenError("devToggleSysadmin is not available in production.");
    }
    if (!ctx.userId) throw new UnauthorizedError();

    const db = getDb();
    const sysadminRole = await db.role.findFirst({
      where: { key: SYSADMIN_ROLE_KEY, builtIn: true, organizationId: null },
    });
    if (!sysadminRole) throw new NotFoundError("Built-in SYSADMIN role", "SYSADMIN");

    const existing = await db.roleAssignment.findFirst({
      where: { userId: ctx.userId, roleId: sysadminRole.id, organizationId: null, revokedAt: null },
    });

    if (existing) {
      await revokeRole(existing.id, ctx.userId, "Dev overlay self-demotion");
      return { promoted: false };
    }

    await assignRole({
      userId: ctx.userId,
      roleId: sysadminRole.id,
      organizationId: null,
      grantedById: null,
      reason: "Dev overlay self-promotion",
    });
    return { promoted: true };
  }),

  // ── Admin role assignment ─────────────────────────────────────

  adminAssignRole: publicProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        roleId: z.string().min(1),
        organizationId: z.string().min(1).nullable().optional(),
        reason: z.string().trim().max(280).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = await requireAdmin(ctx.userId);
      // Sysadmin assignments must come through `tools/sysadmin.ts` or
      // a direct SQL insert, never the admin UI ; reject them here so
      // a hostile or mistaken caller can't escalate via the public
      // mutation. The `assignRole` helper itself still accepts
      // SYSADMIN so the CLI script can reuse it programmatically.
      const role = await findRoleById(input.roleId);
      if (!role) throw new NotFoundError("Role", input.roleId);
      if (role.builtIn && role.key === SYSADMIN_ROLE_KEY) {
        throw new ForbiddenError(
          "SYSADMIN cannot be granted through the admin UI. Use the tools/sysadmin.ts CLI or a direct database insert.",
        );
      }
      return assignRole({
        userId: input.userId,
        roleId: input.roleId,
        organizationId: input.organizationId ?? null,
        grantedById: actorId,
        reason: input.reason,
      });
    }),

  adminRevokeRole: publicProcedure
    .input(
      z.object({
        assignmentId: z.string().min(1),
        reason: z.string().trim().max(280).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = await requireAdmin(ctx.userId);
      // Symmetric with `adminAssignRole` : the SYSADMIN role can only
      // be touched via the CLI / direct DB so any org-tier admin
      // can't de-platform the sysadmin tier through the user-detail
      // UI.
      const db = getDb();
      const target = await db.roleAssignment.findUnique({
        where: { id: input.assignmentId },
        include: { role: { select: { key: true, builtIn: true } } },
      });
      if (target?.role.builtIn && target.role.key === SYSADMIN_ROLE_KEY) {
        throw new ForbiddenError(
          "SYSADMIN cannot be revoked through the admin UI. Use `pnpm tsx tools/sysadmin.ts revoke <user>` instead.",
        );
      }
      await revokeRole(input.assignmentId, actorId, input.reason);
    }),

  // ── Admin role CRUD ────────────────────────────────────────────

  // Lists every role available within an org : the org's custom rows
  // plus the platform-wide built-ins. Used by /admin/rbac and by the
  // role-assign picker on /admin/users/[id].
  adminListRoles: publicProcedure
    .input(z.object({ organizationId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId);
      return listRolesForOrg(input.organizationId);
    }),

  // Single-role lookup by id. Admin-gated. Used by the role detail
  // page (`/admin/rbac/roles/[id]`) which only has the role id and
  // needs the row + permissions in one round-trip ; before this
  // existed the page had to walk every org's role list to find the
  // right entry.
  adminGetRole: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId);
      const role = await findRoleById(input.id);
      if (!role) throw new NotFoundError("Role", input.id);
      return role;
    }),

  adminCreateRole: publicProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        key: z.string().trim().min(2).max(60),
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(280).nullable().optional(),
        color: z.string().nullable().optional(),
        permissions: z.array(permissionKeySchema).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = await requireAdmin(ctx.userId);
      return createRole({
        organizationId: input.organizationId,
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
        permissions: input.permissions ?? [],
        createdById: actorId,
      });
    }),

  adminUpdateRole: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(80).optional(),
        description: z.string().trim().max(280).nullable().optional(),
        color: z.string().nullable().optional(),
        permissions: z.array(permissionKeySchema).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = await requireAdmin(ctx.userId);
      await updateRole({
        id: input.id,
        name: input.name,
        description: input.description,
        color: input.color,
        permissions: input.permissions,
        actorId,
      });
    }),

  adminDeleteRole: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actorId = await requireAdmin(ctx.userId);
      await deleteRole({ id: input.id, actorId });
    }),

  // Read-only roster of SYSADMIN holders for /admin/rbac. Visible to
  // any admin-tier caller (sysadmin OR org-tier admin) so the people
  // who can override them are at least visible. Edits land via the
  // CLI ; no mutation procedures are exposed.
  adminListSysadmins: publicProcedure.query(async ({ ctx }) => {
    await requireAdmin(ctx.userId);
    return listSysadmins();
  }),

  // Merged-registry metadata for the /admin/rbac permission-toggle
  // matrix. Returns each permission's dotted key + description +
  // category. Categories appear in alphabetical order ; permissions
  // inside each category are dotted and sorted alphabetically. Picks
  // up extended modules' permissions automatically because the
  // registry is built at api boot.
  adminListPermissions: publicProcedure.query(async ({ ctx }) => {
    await requireAdmin(ctx.userId);
    const grouped = permissionsByCategory();
    const categories = Object.keys(grouped).sort();
    return {
      categories: categories.map((category) => {
        const keys = grouped[category] ?? [];
        return {
          category,
          permissions: keys.map((key) => ({
            key,
            description: getPermissionDef(key)?.description ?? "",
          })),
        };
      }),
    };
  }),
});

export {
  hasRoleKey,
  hasPermission,
  getUserRoles,
  getAllAssignments,
  isLastAdmin,
  adminAssignmentSummary,
} from "./read";
export {
  findRoleById,
  findBuiltInAdminRole,
  listRolesForOrg,
  listOrgAdminUserIds,
  listSysadminUserIds,
  type RoleRow,
  type RoleWithPermissions,
  type AssignmentRow,
  type AssignmentWithRole,
} from "./data";
export { requireRoleKey, requirePermission, type RbacContext } from "./guards";
export { assignRole, revokeRole, createRole, updateRole, deleteRole } from "./write";
export { ADMIN_ROLE_KEY, SYSADMIN_ROLE_KEY, BUILTIN_ALL_PERMISSIONS_KEYS } from "../contracts/role";
export {
  registerPermissions,
  isKnownPermission,
  parsePermissionKey,
  listPermissions,
  listPermissionDescriptors,
  permissionsByCategory,
  getPermissionDef,
} from "../contracts/permissions";
export type {
  Permission,
  PermissionCategory,
  PermissionDef,
  PermissionDescriptor,
} from "../contracts/permissions";
export { registerRbacPermissions } from "./rbac-permissions";
export { registerRbacEventTypes } from "./event-types";
