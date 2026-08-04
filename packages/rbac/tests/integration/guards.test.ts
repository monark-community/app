import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { ForbiddenError, UnauthorizedError } from "@monark/common";
import { ADMIN_ROLE_KEY } from "../../src/contracts/role";
import { createCustomRole } from "../../src/server/data";
import { assignRole } from "../../src/server/write";
import { requirePermission, requireRoleKey, type RbacContext } from "../../src/server/guards";

// The guard layer (`requirePermission` / `requireRoleKey`) is the enforcement
// seam every tRPC procedure calls. The read layer (`hasPermission` /
// `hasRoleKey`) is covered by read.test.ts ; these specs pin the GUARD
// behaviour on top of it : the Unauthorized / Forbidden throws, the returned
// actor id, and `effectiveOrg` (fall back to `ctx.activeOrganizationId`, and
// let an explicit `orgId` argument override it). A regression here is a
// privilege-escalation or a lockout, so both the allow and deny paths matter.

const ORG_A = "test-org-rbac-guards-a";
const ORG_B = "test-org-rbac-guards-b";

beforeAll(async () => {
  const db = getDb();
  for (const id of [ORG_A, ORG_B]) {
    await db.organization.upsert({
      where: { id },
      create: { id, slug: id, displayName: id },
      update: {},
    });
  }
  await ensureBuiltInRole(ADMIN_ROLE_KEY, "Administrator");
});

// Find-or-create for the built-in ADMIN role (see read.test.ts for why upsert
// can't be used against the nullable-org compound unique).
async function ensureBuiltInRole(key: string, name: string): Promise<void> {
  const db = getDb();
  const existing = await db.role.findFirst({
    where: { key, organizationId: null },
    select: { id: true },
  });
  if (existing) return;
  await db.role.create({ data: { key, name, builtIn: true, organizationId: null } });
}

afterEach(async () => {
  const db = getDb();
  await db.roleAssignment.deleteMany({});
  await db.rolePermission.deleteMany({ where: { role: { builtIn: false } } });
  await db.role.deleteMany({ where: { builtIn: false } });
  await db.user.deleteMany({});
});

async function seedUser(id: string): Promise<string> {
  const user = await getDb().user.create({ data: { id, email: `${id}@test.local` } });
  return user.id;
}
async function adminRoleId(): Promise<string> {
  const row = await getDb().role.findFirst({
    where: { key: ADMIN_ROLE_KEY, organizationId: null },
    select: { id: true },
  });
  if (!row) throw new Error("ADMIN built-in role missing");
  return row.id;
}
async function grantAdmin(userId: string, orgId: string): Promise<void> {
  await assignRole({
    userId,
    roleId: await adminRoleId(),
    organizationId: orgId,
    grantedById: null,
    reason: "test",
  });
}
const ctx = (userId: string | null, activeOrganizationId: string | null): RbacContext => ({
  userId,
  activeOrganizationId,
});

describe("rbac/guards requirePermission", () => {
  it("throws UnauthorizedError when there is no signed-in user", async () => {
    await expect(requirePermission(ctx(null, ORG_A), "users.write")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("throws ForbiddenError when the user lacks the permission", async () => {
    const userId = await seedUser("u-guard-none");
    await expect(requirePermission(ctx(userId, ORG_A), "users.write")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("returns the actor id when an org ADMIN clears any permission (short-circuit)", async () => {
    const userId = await seedUser("u-guard-admin");
    await grantAdmin(userId, ORG_A);
    expect(await requirePermission(ctx(userId, ORG_A), "users.write")).toBe(userId);
    expect(await requirePermission(ctx(userId, ORG_A), "rbac.write")).toBe(userId);
  });

  it("returns the actor id when a custom role grants exactly that permission", async () => {
    const userId = await seedUser("u-guard-custom");
    const role = await createCustomRole({
      organizationId: ORG_A,
      key: "guard-mod",
      name: "Guard Moderator",
      description: null,
      color: null,
      permissions: [{ module: "users", key: "read" }],
    });
    await assignRole({
      userId,
      roleId: role.id,
      organizationId: ORG_A,
      grantedById: null,
      reason: "test",
    });
    expect(await requirePermission(ctx(userId, ORG_A), "users.read")).toBe(userId);
    // A permission the role doesn't grant is still forbidden.
    await expect(requirePermission(ctx(userId, ORG_A), "users.write")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("falls back to ctx.activeOrganizationId when no orgId argument is given", async () => {
    const userId = await seedUser("u-guard-active");
    await grantAdmin(userId, ORG_A);
    // Active org matches the grant → allowed with no orgId argument.
    expect(await requirePermission(ctx(userId, ORG_A), "users.write")).toBe(userId);
    // Active org is elsewhere → denied (the grant doesn't reach org B).
    await expect(requirePermission(ctx(userId, ORG_B), "users.write")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("lets an explicit orgId argument override ctx.activeOrganizationId", async () => {
    const userId = await seedUser("u-guard-override");
    await grantAdmin(userId, ORG_A);
    // Active org is B, but the explicit orgId targets A where the grant lives.
    expect(await requirePermission(ctx(userId, ORG_B), "users.write", ORG_A)).toBe(userId);
  });
});

describe("rbac/guards requireRoleKey", () => {
  it("throws UnauthorizedError when there is no signed-in user", async () => {
    await expect(requireRoleKey(ctx(null, ORG_A), ADMIN_ROLE_KEY)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("throws ForbiddenError when the user lacks the role", async () => {
    const userId = await seedUser("u-guard-norole");
    await expect(requireRoleKey(ctx(userId, ORG_A), ADMIN_ROLE_KEY)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("returns the actor id when the user holds the role (via the active org)", async () => {
    const userId = await seedUser("u-guard-hasrole");
    await grantAdmin(userId, ORG_A);
    expect(await requireRoleKey(ctx(userId, ORG_A), ADMIN_ROLE_KEY)).toBe(userId);
    // A different active org doesn't see the org-A grant.
    await expect(requireRoleKey(ctx(userId, ORG_B), ADMIN_ROLE_KEY)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
