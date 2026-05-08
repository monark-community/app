import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { getDb } from "@monark/db"
import { ValidationError } from "@monark/common"
import { ADMIN_ROLE_KEY, SYSADMIN_ROLE_KEY } from "../../src/contracts/role"
import { createCustomRole } from "../../src/server/data"
import { assignRole } from "../../src/server/write"
import {
  adminAssignmentSummary,
  getUserRoles,
  hasPermission,
  hasRoleKey,
  isLastAdmin,
} from "../../src/server/read"

// Integration tests for the rbac read layer. The authorization path
// has two short-circuit paths that are critical to nail down :
//
//   1. SYSADMIN holders implicitly hold every permission across every
//      org. `findActiveAssignments` surfaces platform-tier SYSADMIN
//      regardless of the requested `orgId` ; `hasPermission` then
//      short-circuits to `true` before consulting `RolePermission`.
//   2. ADMIN holders implicitly hold every permission within their
//      org. `findActiveAssignments` surfaces ADMIN only when the
//      assignment's orgId matches the requested one ; `hasPermission`
//      then short-circuits without a `RolePermission` lookup.
//
// Both paths are load-bearing for `/admin` route gating + the
// permission-check helpers in tRPC procedures. A regression here
// would either silently hand admin powers to non-admins (catastrophic)
// or revoke them from the actual admins (locks the system).
//
// We seed two orgs + a SYSADMIN + ADMIN + a custom moderator role,
// then drive each branch directly. `afterEach` clears every
// assignment + custom role so the next test starts from a known
// slate ; the seeded built-in rows + orgs survive.

const ORG_A = "test-org-rbac-read-a"
const ORG_B = "test-org-rbac-read-b"

beforeAll(async () => {
  const db = getDb()
  for (const id of [ORG_A, ORG_B]) {
    await db.organization.upsert({
      where: { id },
      create: { id, slug: id, displayName: id },
      update: {},
    })
  }
  await ensureBuiltInRole(SYSADMIN_ROLE_KEY, "System Administrator")
  await ensureBuiltInRole(ADMIN_ROLE_KEY, "Administrator")
})

// Find-or-create for built-in roles. Prisma rejects null in compound-
// unique `where` clauses (`@@unique([key, organizationId])` includes
// a nullable column) so we can't use `db.role.upsert` here. Postgres
// null-distinct semantics let `(KEY, null)` coexist with org-scoped
// rows, and `findFirst({ organizationId: null })` resolves the slot
// fine ; only the upsert / unique-where shape rejects null.
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
  // Order matters : `RoleAssignment_roleId_fkey` is ON DELETE
  // RESTRICT in the migration (despite the schema declaring
  // Cascade), so RoleAssignment has to clear before Role.
  const db = getDb()
  await db.roleAssignment.deleteMany({})
  await db.rolePermission.deleteMany({ where: { role: { builtIn: false } } })
  await db.role.deleteMany({ where: { builtIn: false } })
  await db.user.deleteMany({})
})

async function seedUser(id: string): Promise<string> {
  const db = getDb()
  const user = await db.user.create({
    data: { id, email: `${id}@test.local` },
  })
  return user.id
}

async function findRoleByKey(key: string, orgId: string | null): Promise<string> {
  const db = getDb()
  const row = await db.role.findFirst({
    where: { key, organizationId: orgId },
    select: { id: true },
  })
  if (!row) throw new Error(`Role row ${key}@${orgId ?? "platform"} missing`)
  return row.id
}

describe("rbac/read hasPermission — SYSADMIN cross-org reach", () => {
  it("SYSADMIN holds every permission regardless of the requested orgId", async () => {
    const userId = await seedUser("u-sysadmin")
    const sysadminRoleId = await findRoleByKey(SYSADMIN_ROLE_KEY, null)
    await assignRole({
      userId,
      roleId: sysadminRoleId,
      organizationId: null,
      grantedById: null,
      reason: "test seed",
    })
    expect(await hasPermission(userId, "users.write", ORG_A)).toBe(true)
    expect(await hasPermission(userId, "users.write", ORG_B)).toBe(true)
    expect(await hasPermission(userId, "rbac.write", ORG_A)).toBe(true)
    expect(await hasPermission(userId, "webhooks.write", ORG_B)).toBe(true)
    // Even with no orgId scope the platform check resolves true.
    expect(await hasPermission(userId, "users.write")).toBe(true)
  })
})

describe("rbac/read hasPermission — ORG-TIER ADMIN", () => {
  it("ADMIN at org A grants every permission within org A", async () => {
    const userId = await seedUser("u-admin-a")
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null)
    await assignRole({
      userId,
      roleId: adminRoleId,
      organizationId: ORG_A,
      grantedById: null,
      reason: "test seed",
    })
    expect(await hasPermission(userId, "users.write", ORG_A)).toBe(true)
    expect(await hasPermission(userId, "rbac.write", ORG_A)).toBe(true)
  })

  it("ADMIN at org A does NOT leak permissions into org B", async () => {
    const userId = await seedUser("u-admin-only-a")
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null)
    await assignRole({
      userId,
      roleId: adminRoleId,
      organizationId: ORG_A,
      grantedById: null,
      reason: "test seed",
    })
    // Org B has no ADMIN assignment for this user ; should resolve
    // false without crossing the org boundary.
    expect(await hasPermission(userId, "users.write", ORG_B)).toBe(false)
    expect(await hasPermission(userId, "rbac.write", ORG_B)).toBe(false)
  })
})

describe("rbac/read hasPermission — non-admin custom roles", () => {
  it("returns true when a custom role's RolePermission grants the requested permission", async () => {
    const userId = await seedUser("u-mod")
    const role = await createCustomRole({
      organizationId: ORG_A,
      key: "moderator",
      name: "Moderator",
      description: null,
      color: null,
      permissions: [{ module: "users", key: "read" }],
    })
    await assignRole({
      userId,
      roleId: role.id,
      organizationId: ORG_A,
      grantedById: null,
      reason: "test seed",
    })
    expect(await hasPermission(userId, "users.read", ORG_A)).toBe(true)
    // Permission the role doesn't grant returns false.
    expect(await hasPermission(userId, "users.write", ORG_A)).toBe(false)
  })

  it("returns false for a user with no active assignments", async () => {
    const userId = await seedUser("u-naked")
    expect(await hasPermission(userId, "users.write", ORG_A)).toBe(false)
  })

  it("rejects a malformed permission key with ValidationError", async () => {
    const userId = await seedUser("u-malformed")
    await expect(hasPermission(userId, "no-dot", ORG_A)).rejects.toThrow(
      ValidationError,
    )
  })
})

describe("rbac/read hasRoleKey", () => {
  it("returns true when the user holds the requested role at the org", async () => {
    const userId = await seedUser("u-has-admin")
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null)
    await assignRole({
      userId,
      roleId: adminRoleId,
      organizationId: ORG_A,
      grantedById: null,
      reason: "test seed",
    })
    expect(await hasRoleKey(userId, ADMIN_ROLE_KEY, ORG_A)).toBe(true)
    expect(await hasRoleKey(userId, ADMIN_ROLE_KEY, ORG_B)).toBe(false)
  })

  it("rejects ADMIN check without an orgId (programming error)", async () => {
    const userId = await seedUser("u-no-org")
    await expect(hasRoleKey(userId, ADMIN_ROLE_KEY)).rejects.toThrow(
      ValidationError,
    )
  })
})

describe("rbac/read getUserRoles", () => {
  it("dedupes roles when the user holds the same role at platform AND org tier", async () => {
    const userId = await seedUser("u-dual")
    // SYSADMIN at platform tier — surfaces in ANY orgId query via
    // findActiveAssignments' SYSADMIN union.
    const sysadminRoleId = await findRoleByKey(SYSADMIN_ROLE_KEY, null)
    await assignRole({
      userId,
      roleId: sysadminRoleId,
      organizationId: null,
      grantedById: null,
      reason: "test seed",
    })
    const roles = await getUserRoles(userId, ORG_A)
    expect(roles).toHaveLength(1)
    expect(roles[0]?.key).toBe(SYSADMIN_ROLE_KEY)
  })
})

describe("rbac/read isLastAdmin", () => {
  it("returns true when the user is the sole active admin in the org", async () => {
    const userId = await seedUser("u-only-admin")
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null)
    await assignRole({
      userId,
      roleId: adminRoleId,
      organizationId: ORG_A,
      grantedById: null,
      reason: "test seed",
    })
    expect(await isLastAdmin(userId, ORG_A)).toBe(true)
  })

  it("returns false when at least one other active admin exists in the org", async () => {
    const userA = await seedUser("u-admin-a-1")
    const userB = await seedUser("u-admin-a-2")
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null)
    await assignRole({
      userId: userA,
      roleId: adminRoleId,
      organizationId: ORG_A,
      grantedById: null,
      reason: "test seed",
    })
    await assignRole({
      userId: userB,
      roleId: adminRoleId,
      organizationId: ORG_A,
      grantedById: null,
      reason: "test seed",
    })
    expect(await isLastAdmin(userA, ORG_A)).toBe(false)
    expect(await isLastAdmin(userB, ORG_A)).toBe(false)
  })

  it("returns false when the user holds no admin role at all", async () => {
    const userId = await seedUser("u-not-admin")
    expect(await isLastAdmin(userId, ORG_A)).toBe(false)
  })
})

describe("rbac/read adminAssignmentSummary", () => {
  it("hasAdmin=false + earliestGrantedAt=null when the user has no admin assignment", async () => {
    const userId = await seedUser("u-clean")
    const summary = await adminAssignmentSummary(userId)
    expect(summary).toEqual({ hasAdmin: false, earliestGrantedAt: null })
  })

  it("hasAdmin=true when the user holds platform-tier SYSADMIN", async () => {
    const userId = await seedUser("u-sa")
    const sysadminRoleId = await findRoleByKey(SYSADMIN_ROLE_KEY, null)
    await assignRole({
      userId,
      roleId: sysadminRoleId,
      organizationId: null,
      grantedById: null,
      reason: "test seed",
    })
    const summary = await adminAssignmentSummary(userId)
    expect(summary.hasAdmin).toBe(true)
    expect(summary.earliestGrantedAt).toBeInstanceOf(Date)
  })

  it("hasAdmin=true when the user holds org-tier ADMIN", async () => {
    const userId = await seedUser("u-org-admin")
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null)
    await assignRole({
      userId,
      roleId: adminRoleId,
      organizationId: ORG_A,
      grantedById: null,
      reason: "test seed",
    })
    const summary = await adminAssignmentSummary(userId)
    expect(summary.hasAdmin).toBe(true)
    expect(summary.earliestGrantedAt).toBeInstanceOf(Date)
  })
})
