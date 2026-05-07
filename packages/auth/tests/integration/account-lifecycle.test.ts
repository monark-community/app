import { afterEach, describe, expect, it, vi } from "vitest"
import { getDb } from "@monark/db"

// hardDeleteUser calls Supabase admin's deleteUser at the end ; stub
// the admin client at module-import boundary so we don't try to talk
// to a real Supabase instance.
const mockDeleteUser = vi.fn(async (_id: string) => ({ error: null }))
vi.mock("../../src/server/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    auth: { admin: { deleteUser: mockDeleteUser } },
  }),
}))

import {
  hardDeleteUser,
  processExpiredDeletions,
} from "../../src/server/account-lifecycle"

// Every user this spec creates carries one of these id prefixes ; the
// after-each only clears those so a sibling file's seeded users (e.g.
// `totp-user-1`) survive even when test ordering shifts. The full-table
// `TRUNCATE User CASCADE` was racing other files when vitest ran them
// in parallel ; `fileParallelism: false` in the integration config is
// the primary fix, but keeping the cleanup surgical is the belt.
const TEST_USER_IDS = [
  "u-1",
  "u-2",
  "u-anon",
  "u-soft-fail",
  "expired-1",
  "expired-2",
  "recent",
  "active",
]

afterEach(async () => {
  const db = getDb()
  await db.user.deleteMany({ where: { id: { in: TEST_USER_IDS } } })
  mockDeleteUser.mockClear()
})

describe("hardDeleteUser", () => {
  it("anonymizes email + clears displayName / avatarUrl", async () => {
    const db = getDb()
    await db.user.create({
      data: {
        id: "u-1",
        email: "real@lifecycle.test",
        displayName: "Real Name",
        avatarUrl: "https://example.test/a.png",
        deletedAt: new Date(),
      },
    })
    await hardDeleteUser("u-1")
    const row = await db.user.findUnique({ where: { id: "u-1" } })
    expect(row?.email).toMatch(/^deleted-.+@monark\.invalid$/)
    expect(row?.displayName).toBe("Deleted User")
    expect(row?.avatarUrl).toBeNull()
    expect(mockDeleteUser).toHaveBeenCalledWith("u-1")
  })

  it("is a no-op when the user doesn't exist", async () => {
    await hardDeleteUser("does-not-exist")
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it("anonymizes our row even when Supabase admin deleteUser fails", async () => {
    mockDeleteUser.mockResolvedValueOnce({
      error: { message: "supabase boom" },
    })
    const db = getDb()
    await db.user.create({
      data: { id: "u-2", email: "u2@lifecycle.test", deletedAt: new Date() },
    })
    await hardDeleteUser("u-2")
    const row = await db.user.findUnique({ where: { id: "u-2" } })
    expect(row?.email).toMatch(/^deleted-.+@monark\.invalid$/)
  })
})

describe("processExpiredDeletions", () => {
  it("anonymizes only rows past the 14-day grace window", async () => {
    const db = getDb()
    const now = Date.now()
    const past = new Date(now - 15 * 24 * 60 * 60 * 1000)
    const recent = new Date(now - 1 * 24 * 60 * 60 * 1000)

    await db.user.createMany({
      data: [
        { id: "expired-1", email: "e1@lifecycle.test", deletedAt: past },
        { id: "expired-2", email: "e2@lifecycle.test", deletedAt: past },
        { id: "recent", email: "r@lifecycle.test", deletedAt: recent },
        { id: "active", email: "a@lifecycle.test" },
      ],
    })
    const result = await processExpiredDeletions()
    expect(result.attempted).toBe(2)
    expect(result.succeeded).toBe(2)
    expect(result.failed).toBe(0)

    const expired1 = await db.user.findUnique({ where: { id: "expired-1" } })
    const recentRow = await db.user.findUnique({ where: { id: "recent" } })
    const activeRow = await db.user.findUnique({ where: { id: "active" } })
    expect(expired1?.email).toMatch(/@monark\.invalid$/)
    expect(recentRow?.email).toBe("r@lifecycle.test")
    expect(activeRow?.email).toBe("a@lifecycle.test")
  })

  it("is idempotent — re-running ignores already-anonymized rows", async () => {
    const db = getDb()
    const past = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    await db.user.create({
      data: { id: "u-anon", email: "u@lifecycle.test", deletedAt: past },
    })
    const first = await processExpiredDeletions()
    expect(first.succeeded).toBe(1)
    const second = await processExpiredDeletions()
    expect(second.attempted).toBe(0)
    expect(second.succeeded).toBe(0)
  })

  it("counts a failed Supabase delete in the success column (row anonymized)", async () => {
    // hardDeleteUser swallows Supabase errors. The row still flips to
    // anonymized so the loop counts it as a success.
    mockDeleteUser.mockResolvedValueOnce({ error: { message: "boom" } })
    const db = getDb()
    const past = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    await db.user.create({
      data: { id: "u-soft-fail", email: "sf@lifecycle.test", deletedAt: past },
    })
    const result = await processExpiredDeletions()
    expect(result.succeeded).toBe(1)
    expect(result.failed).toBe(0)
  })

  it("returns zero counts when no rows are eligible", async () => {
    const result = await processExpiredDeletions()
    expect(result).toEqual({ attempted: 0, succeeded: 0, failed: 0 })
  })
})
