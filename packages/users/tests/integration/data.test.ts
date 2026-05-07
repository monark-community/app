import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getDb } from "@monark/db"
import {
  findById,
  findByEmail,
  listUsersForAdmin,
  setDeletedAt,
  updateEmail,
  updateProfileData,
} from "../../src/server/data"

// Integration tests for the users data layer. Each case starts from
// a clean User table — `afterEach` truncates. The shared Postgres
// testcontainer in `@monark/test-utils/global-setup` boots once for
// the whole spec process.

afterEach(async () => {
  const db = getDb()
  // CASCADE clears RoleAssignment + OrganizationMembership rows
  // that reference the user. Order doesn't matter inside the
  // truncate ; Postgres handles it.
  await db.user.deleteMany({})
})

beforeEach(async () => {
  // No-op ; placeholder for future shared fixtures (e.g. an org +
  // role row that every test would otherwise re-seed).
})

async function seedUser(overrides: Partial<{
  id: string
  email: string
  displayName: string | null
  emailVerifiedAt: Date | null
  disabledAt: Date | null
  deletedAt: Date | null
  createdAt: Date
}> = {}) {
  const db = getDb()
  return db.user.create({
    data: {
      id: overrides.id ?? `u-${Math.random().toString(36).slice(2, 10)}`,
      email: overrides.email ?? `${Math.random().toString(36).slice(2, 8)}@x.io`,
      displayName: overrides.displayName ?? "Test User",
      emailVerifiedAt: overrides.emailVerifiedAt ?? new Date(),
      disabledAt: overrides.disabledAt ?? null,
      deletedAt: overrides.deletedAt ?? null,
      createdAt: overrides.createdAt ?? new Date(),
    },
  })
}

describe("users/data findById + findByEmail", () => {
  it("returns null for an unknown id / email", async () => {
    expect(await findById("does-not-exist")).toBeNull()
    expect(await findByEmail("nobody@x.io")).toBeNull()
  })

  it("returns the row for a real id / email", async () => {
    const seeded = await seedUser({ id: "u-1", email: "alice@x.io" })
    const byId = await findById("u-1")
    expect(byId?.id).toBe("u-1")
    expect(byId?.email).toBe("alice@x.io")
    const byEmail = await findByEmail("alice@x.io")
    expect(byEmail?.id).toBe(seeded.id)
  })
})

describe("users/data updateProfileData", () => {
  it("updates the display name + bio in place", async () => {
    const seeded = await seedUser({ displayName: "Original" })
    const updated = await updateProfileData(seeded.id, {
      displayName: "Updated",
      bio: "A short bio",
    })
    expect(updated.displayName).toBe("Updated")
    expect(updated.bio).toBe("A short bio")
  })

  it("clears a field when null is passed (vs undefined which leaves it)", async () => {
    const seeded = await seedUser({ displayName: "Original" })
    const updated = await updateProfileData(seeded.id, {
      displayName: null,
    })
    expect(updated.displayName).toBeNull()
  })

  it("updates the locale preference + avatar / banner URLs", async () => {
    const seeded = await seedUser()
    const updated = await updateProfileData(seeded.id, {
      avatarUrl: "https://cdn.example.com/avatar.webp",
      bannerUrl: "https://cdn.example.com/banner.webp",
      localePreference: "fr",
    })
    expect(updated.avatarUrl).toBe("https://cdn.example.com/avatar.webp")
    expect(updated.bannerUrl).toBe("https://cdn.example.com/banner.webp")
    expect(updated.localePreference).toBe("fr")
  })
})

describe("users/data updateEmail", () => {
  it("rotates the email + the new value reads back via findByEmail", async () => {
    const seeded = await seedUser({ email: "old@x.io" })
    await updateEmail(seeded.id, "new@x.io")
    expect(await findByEmail("old@x.io")).toBeNull()
    expect((await findByEmail("new@x.io"))?.id).toBe(seeded.id)
  })

  it("rejects a duplicate email (unique constraint)", async () => {
    const a = await seedUser({ email: "a@x.io" })
    await seedUser({ email: "b@x.io" })
    await expect(updateEmail(a.id, "b@x.io")).rejects.toThrow()
  })
})

describe("users/data setDeletedAt", () => {
  it("stamps the grace-period start", async () => {
    const seeded = await seedUser()
    const at = new Date("2026-05-01T00:00:00Z")
    const updated = await setDeletedAt(seeded.id, at)
    expect(updated.deletedAt?.toISOString()).toBe(at.toISOString())
  })

  it("clears deletedAt when null is passed (cancellation path)", async () => {
    const seeded = await seedUser({ deletedAt: new Date() })
    const updated = await setDeletedAt(seeded.id, null)
    expect(updated.deletedAt).toBeNull()
  })
})

describe("users/data listUsersForAdmin", () => {
  it("returns the live identities (excludes anonymized rows)", async () => {
    await seedUser({ email: "alice@x.io" })
    await seedUser({ email: "anonymized-1@monark.invalid" })
    await seedUser({ email: "bob@x.io" })
    const { items } = await listUsersForAdmin({ limit: 10 })
    const emails = items.map((u) => u.email)
    expect(emails).toContain("alice@x.io")
    expect(emails).toContain("bob@x.io")
    expect(emails).not.toContain("anonymized-1@monark.invalid")
  })

  it("filters by case-insensitive search across email + displayName", async () => {
    await seedUser({ email: "alice@x.io", displayName: "Alice In Wonderland" })
    await seedUser({ email: "bob@x.io", displayName: "Bob The Builder" })
    const aliceByEmail = await listUsersForAdmin({
      search: "ALICE",
      limit: 10,
    })
    expect(aliceByEmail.items).toHaveLength(1)
    expect(aliceByEmail.items[0]?.email).toBe("alice@x.io")
    const bobByName = await listUsersForAdmin({
      search: "builder",
      limit: 10,
    })
    expect(bobByName.items).toHaveLength(1)
    expect(bobByName.items[0]?.email).toBe("bob@x.io")
  })

  it("paginates via the cursor + nextCursor pair", async () => {
    // Seed 5 users with deterministic createdAt so order is stable.
    const base = new Date("2026-05-01T00:00:00Z")
    for (let i = 0; i < 5; i += 1) {
      await seedUser({
        id: `u-${i}`,
        email: `u${i}@x.io`,
        createdAt: new Date(base.getTime() + i * 1000),
      })
    }
    const first = await listUsersForAdmin({ limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).toBeTruthy()
    const second = await listUsersForAdmin({
      limit: 2,
      cursor: first.nextCursor!,
    })
    expect(second.items).toHaveLength(2)
    // No overlap with the first page.
    const firstIds = new Set(first.items.map((u) => u.id))
    expect(second.items.every((u) => !firstIds.has(u.id))).toBe(true)
  })

  it("nextCursor is null on the last page", async () => {
    await seedUser({ email: "only@x.io" })
    const { nextCursor } = await listUsersForAdmin({ limit: 10 })
    expect(nextCursor).toBeNull()
  })

  it("filters by status=disabled", async () => {
    await seedUser({ email: "active@x.io" })
    await seedUser({
      email: "disabled@x.io",
      disabledAt: new Date(),
    })
    const result = await listUsersForAdmin({
      statuses: ["disabled"],
      limit: 10,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.email).toBe("disabled@x.io")
  })

  it("filters by status=pending-deletion", async () => {
    await seedUser({ email: "active@x.io" })
    await seedUser({ email: "going@x.io", deletedAt: new Date() })
    const result = await listUsersForAdmin({
      statuses: ["pending-deletion"],
      limit: 10,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.email).toBe("going@x.io")
  })

  it("filters by status=active (excludes disabled + pending-deletion)", async () => {
    await seedUser({ email: "alive@x.io" })
    await seedUser({ email: "disabled@x.io", disabledAt: new Date() })
    await seedUser({ email: "going@x.io", deletedAt: new Date() })
    const result = await listUsersForAdmin({
      statuses: ["active"],
      limit: 10,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.email).toBe("alive@x.io")
  })

  it("filters by emailVerified=true (only verified users)", async () => {
    await seedUser({ email: "verified@x.io", emailVerifiedAt: new Date() })
    await seedUser({ email: "pending@x.io", emailVerifiedAt: null })
    const result = await listUsersForAdmin({
      emailVerified: true,
      limit: 10,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.email).toBe("verified@x.io")
  })

  it("filters by emailVerified=false (only unverified users)", async () => {
    await seedUser({ email: "verified@x.io", emailVerifiedAt: new Date() })
    await seedUser({ email: "pending@x.io", emailVerifiedAt: null })
    const result = await listUsersForAdmin({
      emailVerified: false,
      limit: 10,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.email).toBe("pending@x.io")
  })

  it("filters by joinedAfter (excludes older rows)", async () => {
    await seedUser({
      email: "old@x.io",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    })
    await seedUser({
      email: "new@x.io",
      createdAt: new Date("2026-05-01T00:00:00Z"),
    })
    const result = await listUsersForAdmin({
      joinedAfter: new Date("2026-04-01T00:00:00Z"),
      limit: 10,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.email).toBe("new@x.io")
  })

  it("returns newest registrations first (createdAt desc, id desc)", async () => {
    await seedUser({
      email: "earliest@x.io",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    })
    await seedUser({
      email: "middle@x.io",
      createdAt: new Date("2026-03-01T00:00:00Z"),
    })
    await seedUser({
      email: "latest@x.io",
      createdAt: new Date("2026-05-01T00:00:00Z"),
    })
    const { items } = await listUsersForAdmin({ limit: 10 })
    expect(items.map((u) => u.email)).toEqual([
      "latest@x.io",
      "middle@x.io",
      "earliest@x.io",
    ])
  })

  it("composes filters (status=active + verified + joinedAfter)", async () => {
    await seedUser({
      email: "match@x.io",
      emailVerifiedAt: new Date(),
      createdAt: new Date("2026-05-01T00:00:00Z"),
    })
    await seedUser({
      email: "wrong-status@x.io",
      disabledAt: new Date(),
      emailVerifiedAt: new Date(),
      createdAt: new Date("2026-05-01T00:00:00Z"),
    })
    await seedUser({
      email: "wrong-verified@x.io",
      emailVerifiedAt: null,
      createdAt: new Date("2026-05-01T00:00:00Z"),
    })
    await seedUser({
      email: "wrong-date@x.io",
      emailVerifiedAt: new Date(),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    })
    const result = await listUsersForAdmin({
      statuses: ["active"],
      emailVerified: true,
      joinedAfter: new Date("2026-04-01T00:00:00Z"),
      limit: 10,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.email).toBe("match@x.io")
  })
})
