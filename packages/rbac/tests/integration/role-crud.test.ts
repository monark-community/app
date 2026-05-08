import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { getDb } from "@monark/db"
import { truncate } from "@monark/test-utils/db"
import { ADMIN_ROLE_KEY, SYSADMIN_ROLE_KEY } from "../../src/contracts/role"
import {
  countActiveAssignmentsForRole,
  createCustomRole,
  deleteRoleRow,
  findRoleById,
  listRolesForOrg,
  updateRolePatch,
} from "../../src/server/data"

// Integration tests for the rbac data layer. Each case starts from a
// known clean slate — `truncate` clears the role + assignment +
// organization tables in `afterEach`. The Postgres testcontainer is
// shared across the whole spec process (booted in
// `@monark/test-utils/global-setup`) so the boot cost amortises.

const ORG_ID = "test-org-1"

beforeAll(async () => {
  // Seed the org row + the platform-tier built-in roles every
  // assignment-related test relies on. The Prisma migration creates
  // an empty schema ; we have to seed the SYSADMIN + ADMIN rows
  // ourselves because the migration that historically did this is
  // a data migration, not a schema one.
  const db = getDb()
  await db.organization.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      slug: "test-org",
      displayName: "Test Org",
    },
    update: {},
  })
  await ensureBuiltInRole(SYSADMIN_ROLE_KEY, "System Administrator")
  await ensureBuiltInRole(ADMIN_ROLE_KEY, "Administrator")
})

// Find-or-create for built-in roles. Prisma rejects null in compound-
// unique `where` clauses ; `findFirst` allows it. See
// `write.test.ts` / `read.test.ts` for the same pattern.
async function ensureBuiltInRole(key: string, name: string): Promise<void> {
  const db = getDb()
  const existing = await db.role.findFirst({
    where: { key, organizationId: null },
    select: { id: true },
  })
  if (existing) return
  await db.role.create({
    data: { key, name, builtIn: true, organizationId: null },
  })
}

afterEach(async () => {
  // Clear only the role-related tables ; the seeded built-ins +
  // org row stay so the next test doesn't re-seed.
  // Order matters : the migration declares RoleAssignment_roleId_fkey
  // ON DELETE RESTRICT (the prisma schema says Cascade but the
  // migration won the drift), so RoleAssignment must clear before
  // Role + RolePermission. Users go last because RoleAssignment FKs
  // userId + grantedById to User.
  const db = getDb()
  await db.roleAssignment.deleteMany({})
  await db.rolePermission.deleteMany({
    where: { role: { builtIn: false } },
  })
  await db.role.deleteMany({ where: { builtIn: false } })
  await db.user.deleteMany({})
})

describe("rbac/data findRoleById", () => {
  it("returns null for a non-existent id", async () => {
    const role = await findRoleById("does-not-exist")
    expect(role).toBeNull()
  })

  it("returns the role row + its permissions when found", async () => {
    const created = await createCustomRole({
      organizationId: ORG_ID,
      key: "moderator",
      name: "Moderator",
      description: "Can moderate posts",
      color: "#F0870C",
      permissions: [{ module: "organizations", key: "invite-member" }],
    })
    const fetched = await findRoleById(created.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.key).toBe("moderator")
    expect(fetched?.name).toBe("Moderator")
    expect(fetched?.color).toBe("#F0870C")
    expect(fetched?.organizationId).toBe(ORG_ID)
    // The `permissions` relation is included by default.
    expect(fetched?.permissions).toHaveLength(1)
    expect(fetched?.permissions[0]?.module).toBe("organizations")
    expect(fetched?.permissions[0]?.permission).toBe("invite-member")
  })
})

describe("rbac/data createCustomRole", () => {
  it("creates a role + writes the permission rows", async () => {
    const created = await createCustomRole({
      organizationId: ORG_ID,
      key: "editor",
      name: "Editor",
      description: null,
      color: null,
      permissions: [
        { module: "organizations", key: "invite-member" },
        { module: "organizations", key: "remove-member" },
      ],
    })
    expect(created.id).toBeTruthy()
    expect(created.key).toBe("editor")
    expect(created.builtIn).toBe(false)
    expect(created.organizationId).toBe(ORG_ID)

    // Permission rows landed in the join table with module split.
    const db = getDb()
    const perms = await db.rolePermission.findMany({
      where: { roleId: created.id },
    })
    expect(perms).toHaveLength(2)
    expect(perms.map((p) => `${p.module}.${p.permission}`).sort()).toEqual([
      "organizations.invite-member",
      "organizations.remove-member",
    ])
  })

  it("creates a role with no permissions when the array is empty", async () => {
    const created = await createCustomRole({
      organizationId: ORG_ID,
      key: "blank",
      name: "Blank",
      description: null,
      color: null,
      permissions: [],
    })
    const db = getDb()
    const perms = await db.rolePermission.findMany({
      where: { roleId: created.id },
    })
    expect(perms).toHaveLength(0)
  })

  it("rejects two roles with the same (key, organizationId) tuple", async () => {
    await createCustomRole({
      organizationId: ORG_ID,
      key: "moderator",
      name: "Moderator",
      description: null,
      color: null,
      permissions: [],
    })
    await expect(
      createCustomRole({
        organizationId: ORG_ID,
        key: "moderator",
        name: "Moderator Again",
        description: null,
        color: null,
        permissions: [],
      }),
    ).rejects.toThrow()
  })
})

describe("rbac/data listRolesForOrg", () => {
  it("returns the org's custom roles + the platform-wide built-in ADMIN", async () => {
    await createCustomRole({
      organizationId: ORG_ID,
      key: "moderator",
      name: "Moderator",
      description: null,
      color: null,
      permissions: [],
    })
    const roles = await listRolesForOrg(ORG_ID)
    const keys = roles.map((r) => r.key).sort()
    expect(keys).toContain("moderator")
    expect(keys).toContain(ADMIN_ROLE_KEY)
    // SYSADMIN is excluded — it's never UI-assignable.
    expect(keys).not.toContain(SYSADMIN_ROLE_KEY)
  })

  it("returns built-in ADMIN + nothing else when the org has no custom roles", async () => {
    const roles = await listRolesForOrg(ORG_ID)
    const keys = roles.map((r) => r.key)
    expect(keys).toEqual([ADMIN_ROLE_KEY])
  })

  it("excludes custom roles that belong to a different org", async () => {
    const db = getDb()
    await db.organization.create({
      data: { id: "other-org", slug: "other", displayName: "Other" },
    })
    await createCustomRole({
      organizationId: "other-org",
      key: "their-role",
      name: "Their role",
      description: null,
      color: null,
      permissions: [],
    })
    const roles = await listRolesForOrg(ORG_ID)
    expect(roles.map((r) => r.key)).not.toContain("their-role")
  })
})

describe("rbac/data updateRolePatch", () => {
  it("updates name + description + color in one transaction", async () => {
    const created = await createCustomRole({
      organizationId: ORG_ID,
      key: "moderator",
      name: "Moderator",
      description: "Initial",
      color: "#F0870C",
      permissions: [],
    })
    const updated = await updateRolePatch({
      id: created.id,
      name: "Senior Moderator",
      description: "Updated",
      color: "#abcdef",
    })
    expect(updated.name).toBe("Senior Moderator")
    expect(updated.description).toBe("Updated")
    expect(updated.color).toBe("#abcdef")
  })

  it("replaces the permission set wholesale (not additive)", async () => {
    const created = await createCustomRole({
      organizationId: ORG_ID,
      key: "moderator",
      name: "Moderator",
      description: null,
      color: null,
      permissions: [
        { module: "organizations", key: "invite-member" },
        { module: "organizations", key: "remove-member" },
      ],
    })
    const updated = await updateRolePatch({
      id: created.id,
      permissions: [{ module: "rbac", key: "assign-role" }],
    })
    expect(
      updated.permissions.map((p) => `${p.module}.${p.permission}`).sort(),
    ).toEqual(["rbac.assign-role"])
  })

  it("leaves the permission set untouched when omitted from the patch", async () => {
    const created = await createCustomRole({
      organizationId: ORG_ID,
      key: "moderator",
      name: "Moderator",
      description: null,
      color: null,
      permissions: [{ module: "organizations", key: "invite-member" }],
    })
    const updated = await updateRolePatch({
      id: created.id,
      name: "Senior Moderator",
    })
    expect(
      updated.permissions.map((p) => `${p.module}.${p.permission}`),
    ).toEqual(["organizations.invite-member"])
  })
})

describe("rbac/data countActiveAssignmentsForRole", () => {
  it("returns zero for a role nobody has been assigned", async () => {
    const created = await createCustomRole({
      organizationId: ORG_ID,
      key: "lonely",
      name: "Lonely",
      description: null,
      color: null,
      permissions: [],
    })
    const count = await countActiveAssignmentsForRole(created.id)
    expect(count).toBe(0)
  })

  it("counts only non-revoked assignments", async () => {
    const db = getDb()
    const role = await createCustomRole({
      organizationId: ORG_ID,
      key: "test-role",
      name: "Test",
      description: null,
      color: null,
      permissions: [],
    })
    // Seed users + the granter — `RoleAssignment.userId` and
    // `grantedById` both FK to User.
    await db.user.createMany({
      data: [
        { id: "u1", email: "u1@test.local" },
        { id: "u2", email: "u2@test.local" },
        { id: "u3", email: "u3@test.local" },
        { id: "g1", email: "g1@test.local" },
      ],
    })
    // Seed three assignments : two active, one revoked. The count
    // should ignore the revoked one.
    await db.roleAssignment.createMany({
      data: [
        { userId: "u1", roleId: role.id, organizationId: ORG_ID, grantedById: "g1" },
        { userId: "u2", roleId: role.id, organizationId: ORG_ID, grantedById: "g1" },
        {
          userId: "u3",
          roleId: role.id,
          organizationId: ORG_ID,
          grantedById: "g1",
          revokedAt: new Date(),
          revokedById: "g1",
        },
      ],
    })
    const count = await countActiveAssignmentsForRole(role.id)
    expect(count).toBe(2)
  })
})

describe("rbac/data deleteRoleRow", () => {
  it("hard-deletes the role row + cascades the permission rows", async () => {
    const created = await createCustomRole({
      organizationId: ORG_ID,
      key: "to-delete",
      name: "Doomed",
      description: null,
      color: null,
      permissions: [{ module: "organizations", key: "invite-member" }],
    })
    await deleteRoleRow(created.id)
    const role = await findRoleById(created.id)
    expect(role).toBeNull()
    // Permission rows cascade-delete via the FK.
    const db = getDb()
    const perms = await db.rolePermission.findMany({
      where: { roleId: created.id },
    })
    expect(perms).toHaveLength(0)
  })
})

// Smoke check that the shared truncate helper works. Each test
// already truncates in `afterEach` ; this one verifies the helper
// itself is wired correctly.
describe("@monark/test-utils truncate helper", () => {
  it("clears every named table", async () => {
    const db = getDb()
    await createCustomRole({
      organizationId: ORG_ID,
      key: "smoke",
      name: "Smoke",
      description: null,
      color: null,
      permissions: [{ module: "organizations", key: "invite-member" }],
    })
    await truncate(db, ["RoleAssignment", "RolePermission"])
    const remaining = await db.rolePermission.count()
    expect(remaining).toBe(0)
  })
})
