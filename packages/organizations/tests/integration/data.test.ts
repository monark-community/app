import { afterEach, describe, expect, it } from "vitest"
import { getDb } from "@monark/db"
import {
  countActiveOrganizations,
  createOrganizationRow,
  findById,
  findOnlyActiveOrganization,
  findOrgsForUser,
  findBySlug,
  isMember,
  listOrganizationsForAdmin,
  updateOrganizationForAdmin,
} from "../../src/server/data"

afterEach(async () => {
  const db = getDb()
  // Clear in dep order : memberships → invites → redirects → orgs.
  // CASCADE handles the rest but explicit order avoids edge-case
  // races when tables sit at the head of a long FK chain.
  await db.organizationMembership.deleteMany({})
  await db.invite.deleteMany({})
  await db.orgSlugRedirect.deleteMany({})
  await db.organization.deleteMany({})
  await db.user.deleteMany({})
})

async function seedUser(id = `u-${Math.random().toString(36).slice(2, 10)}`) {
  const db = getDb()
  return db.user.create({
    data: {
      id,
      email: `${id}@x.io`,
      displayName: id,
      emailVerifiedAt: new Date(),
    },
  })
}

async function seedOrg(input: Partial<{
  id: string
  slug: string
  displayName: string
  deletedAt: Date | null
  createdAt: Date
}> = {}) {
  const db = getDb()
  return db.organization.create({
    data: {
      id: input.id ?? `o-${Math.random().toString(36).slice(2, 10)}`,
      slug: input.slug ?? `slug-${Math.random().toString(36).slice(2, 8)}`,
      displayName: input.displayName ?? "Test Org",
      deletedAt: input.deletedAt ?? null,
      createdAt: input.createdAt ?? new Date(),
    },
  })
}

async function seedMembership(userId: string, orgId: string) {
  const db = getDb()
  return db.organizationMembership.create({
    data: { userId, organizationId: orgId, joinedAt: new Date() },
  })
}

describe("organizations/data findById + findBySlug", () => {
  it("returns null for an unknown id / slug", async () => {
    expect(await findById("missing")).toBeNull()
    expect(await findBySlug("missing")).toBeNull()
  })

  it("returns the row for a real id / slug", async () => {
    const seeded = await seedOrg({ id: "o-1", slug: "acme" })
    expect((await findById("o-1"))?.id).toBe("o-1")
    expect((await findBySlug("acme"))?.id).toBe(seeded.id)
  })
})

describe("organizations/data countActiveOrganizations", () => {
  it("returns 0 on an empty workspace", async () => {
    expect(await countActiveOrganizations()).toBe(0)
  })

  it("excludes soft-deleted rows", async () => {
    await seedOrg({ slug: "alive" })
    await seedOrg({ slug: "dead", deletedAt: new Date() })
    expect(await countActiveOrganizations()).toBe(1)
  })

  it("counts every live row", async () => {
    await seedOrg({ slug: "a" })
    await seedOrg({ slug: "b" })
    await seedOrg({ slug: "c" })
    expect(await countActiveOrganizations()).toBe(3)
  })
})

describe("organizations/data findOnlyActiveOrganization", () => {
  it("returns null on zero rows", async () => {
    expect(await findOnlyActiveOrganization()).toBeNull()
  })

  it("returns the singleton when exactly one row exists", async () => {
    const seeded = await seedOrg({ slug: "only" })
    const found = await findOnlyActiveOrganization()
    expect(found?.id).toBe(seeded.id)
  })

  it("returns null when more than one row exists (multi-tenant signal)", async () => {
    await seedOrg({ slug: "a" })
    await seedOrg({ slug: "b" })
    expect(await findOnlyActiveOrganization()).toBeNull()
  })

  it("ignores soft-deleted rows when picking the singleton", async () => {
    await seedOrg({ slug: "alive" })
    await seedOrg({ slug: "dead", deletedAt: new Date() })
    const found = await findOnlyActiveOrganization()
    expect(found?.slug).toBe("alive")
  })
})

describe("organizations/data createOrganizationRow", () => {
  it("creates a fresh row with canonical fields", async () => {
    const created = await createOrganizationRow({
      slug: "fresh",
      displayName: "Fresh Co",
      primaryColor: "#F0870C",
      logoUrl: null,
    })
    expect(created.slug).toBe("fresh")
    expect(created.displayName).toBe("Fresh Co")
    expect(created.primaryColor).toBe("#F0870C")
    expect(created.deletedAt).toBeNull()
  })

  it("is idempotent on the slug — second call returns the existing row", async () => {
    const first = await createOrganizationRow({
      slug: "fresh",
      displayName: "First Take",
    })
    const second = await createOrganizationRow({
      slug: "fresh",
      // The displayName is intentionally ignored on the second call ;
      // the bootstrap hook treats `slug` as the identity check.
      displayName: "Second Take",
    })
    expect(second.id).toBe(first.id)
    expect(second.displayName).toBe("First Take")
  })

  it("treats null primaryColor + null logoUrl as defaults", async () => {
    const created = await createOrganizationRow({
      slug: "minimal",
      displayName: "Minimal",
    })
    expect(created.primaryColor).toBeNull()
    expect(created.logoUrl).toBeNull()
  })
})

describe("organizations/data isMember + findOrgsForUser", () => {
  it("isMember returns true only for live memberships", async () => {
    const user = await seedUser("u-1")
    const org = await seedOrg({ id: "o-1" })
    expect(await isMember(user.id, org.id)).toBe(false)
    await seedMembership(user.id, org.id)
    expect(await isMember(user.id, org.id)).toBe(true)
  })

  it("isMember returns false when the membership has a leftAt", async () => {
    const user = await seedUser("u-2")
    const org = await seedOrg({ id: "o-2" })
    const db = getDb()
    await db.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        joinedAt: new Date(),
        leftAt: new Date(),
      },
    })
    expect(await isMember(user.id, org.id)).toBe(false)
  })

  it("findOrgsForUser returns the user's live memberships in joinedAt order", async () => {
    const user = await seedUser("u-3")
    const orgA = await seedOrg({ id: "o-a", slug: "a" })
    const orgB = await seedOrg({ id: "o-b", slug: "b" })
    const db = getDb()
    await db.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: orgA.id,
        joinedAt: new Date("2026-01-01T00:00:00Z"),
      },
    })
    await db.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: orgB.id,
        joinedAt: new Date("2026-02-01T00:00:00Z"),
      },
    })
    const orgs = await findOrgsForUser(user.id)
    expect(orgs).toHaveLength(2)
    // Ordered by joinedAt ASC.
    expect(orgs[0]?.id).toBe(orgA.id)
    expect(orgs[1]?.id).toBe(orgB.id)
  })

  it("findOrgsForUser excludes orgs the user has left", async () => {
    const user = await seedUser("u-4")
    const orgAlive = await seedOrg({ id: "o-alive", slug: "alive" })
    const orgLeft = await seedOrg({ id: "o-left", slug: "left" })
    await seedMembership(user.id, orgAlive.id)
    const db = getDb()
    await db.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: orgLeft.id,
        joinedAt: new Date(),
        leftAt: new Date(),
      },
    })
    const orgs = await findOrgsForUser(user.id)
    expect(orgs.map((o) => o.id)).toEqual([orgAlive.id])
  })

  it("findOrgsForUser excludes soft-deleted orgs", async () => {
    const user = await seedUser("u-5")
    const orgAlive = await seedOrg({ id: "o-alive", slug: "alive" })
    const orgDead = await seedOrg({
      id: "o-dead",
      slug: "dead",
      deletedAt: new Date(),
    })
    await seedMembership(user.id, orgAlive.id)
    await seedMembership(user.id, orgDead.id)
    const orgs = await findOrgsForUser(user.id)
    expect(orgs.map((o) => o.id)).toEqual([orgAlive.id])
  })
})

describe("organizations/data listOrganizationsForAdmin", () => {
  it("returns the live orgs (excludes soft-deleted)", async () => {
    await seedOrg({ slug: "alive" })
    await seedOrg({ slug: "dead", deletedAt: new Date() })
    const result = await listOrganizationsForAdmin({ limit: 10 })
    expect(result.items.map((o) => o.slug)).toEqual(["alive"])
  })

  it("filters by case-insensitive search across displayName + slug", async () => {
    await seedOrg({ slug: "acme", displayName: "Acme Co" })
    await seedOrg({ slug: "beta", displayName: "Beta Inc" })
    const byName = await listOrganizationsForAdmin({
      search: "ACME",
      limit: 10,
    })
    expect(byName.items.map((o) => o.slug)).toEqual(["acme"])
    const bySlug = await listOrganizationsForAdmin({
      search: "beta",
      limit: 10,
    })
    expect(bySlug.items.map((o) => o.slug)).toEqual(["beta"])
  })

  it("paginates via cursor + nextCursor", async () => {
    const base = new Date("2026-05-01T00:00:00Z")
    for (let i = 0; i < 5; i += 1) {
      await seedOrg({
        slug: `o-${i}`,
        createdAt: new Date(base.getTime() + i * 1000),
      })
    }
    const first = await listOrganizationsForAdmin({ limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).toBeTruthy()
    const second = await listOrganizationsForAdmin({
      limit: 2,
      cursor: first.nextCursor!,
    })
    expect(second.items).toHaveLength(2)
    const firstIds = new Set(first.items.map((o) => o.id))
    expect(second.items.every((o) => !firstIds.has(o.id))).toBe(true)
  })
})

describe("organizations/data updateOrganizationForAdmin (slug rotation + redirects)", () => {
  it("updates simple fields without touching the redirect table", async () => {
    const org = await seedOrg({ slug: "acme" })
    const result = await updateOrganizationForAdmin(org.id, {
      displayName: "Renamed",
      primaryColor: "#abcdef",
    })
    expect(result.row.displayName).toBe("Renamed")
    expect(result.row.primaryColor).toBe("#abcdef")
    expect(result.previousSlug).toBeUndefined()
    const db = getDb()
    expect(await db.orgSlugRedirect.count()).toBe(0)
  })

  it("rotates the slug + records a 90-day redirect for the previous one", async () => {
    const org = await seedOrg({ slug: "old-slug" })
    const before = Date.now()
    const result = await updateOrganizationForAdmin(org.id, {
      slug: "new-slug",
    })
    expect(result.row.slug).toBe("new-slug")
    expect(result.previousSlug).toBe("old-slug")
    const db = getDb()
    const redirect = await db.orgSlugRedirect.findUnique({
      where: { oldSlug: "old-slug" },
    })
    expect(redirect).not.toBeNull()
    expect(redirect?.organizationId).toBe(org.id)
    // Expiry ~ 90 days out (allow a small wall-clock fudge for test
    // execution time).
    const ninetyDays = 90 * 24 * 60 * 60 * 1000
    const elapsed = redirect!.expiresAt.getTime() - before - ninetyDays
    expect(elapsed).toBeGreaterThan(-2_000) // up to 2 s of test latency
    expect(elapsed).toBeLessThan(5_000)
  })

  it("rejects a slug rotation that would collide with another org", async () => {
    const orgA = await seedOrg({ slug: "acme" })
    await seedOrg({ slug: "beta" })
    await expect(
      updateOrganizationForAdmin(orgA.id, { slug: "beta" }),
    ).rejects.toThrow(/Slug already in use/)
  })

  it("a no-op slug update (same slug) doesn't record a redirect", async () => {
    const org = await seedOrg({ slug: "acme" })
    const result = await updateOrganizationForAdmin(org.id, { slug: "acme" })
    expect(result.previousSlug).toBeUndefined()
    const db = getDb()
    expect(await db.orgSlugRedirect.count()).toBe(0)
  })

  it("upserts on the redirect when the same old slug is rotated through twice", async () => {
    const org = await seedOrg({ slug: "v1" })
    await updateOrganizationForAdmin(org.id, { slug: "v2" })
    // Roll back to v1 then forward to v3 ; the redirect for v1
    // should still be a single row, not duplicated.
    await updateOrganizationForAdmin(org.id, { slug: "v1" })
    await updateOrganizationForAdmin(org.id, { slug: "v3" })
    const db = getDb()
    const v1Redirect = await db.orgSlugRedirect.findMany({
      where: { oldSlug: "v1" },
    })
    expect(v1Redirect).toHaveLength(1)
  })

  it("the whole patch runs in a transaction (failed slug doesn't leave field changes)", async () => {
    const orgA = await seedOrg({ slug: "acme", displayName: "Original" })
    await seedOrg({ slug: "taken" })
    await expect(
      updateOrganizationForAdmin(orgA.id, {
        displayName: "Renamed",
        slug: "taken",
      }),
    ).rejects.toThrow()
    // The displayName change should NOT have landed because the
    // slug-collision aborted the transaction.
    const reloaded = await findById(orgA.id)
    expect(reloaded?.displayName).toBe("Original")
  })

  it("throws when the org id doesn't exist", async () => {
    await expect(
      updateOrganizationForAdmin("does-not-exist", { displayName: "X" }),
    ).rejects.toThrow(/not found/)
  })
})
