import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { getDb } from "@monark/db"
import { truncate } from "@monark/test-utils/db"

// Stub the Supabase admin client at the module-import boundary so the
// revoke flow doesn't actually try to talk to Supabase ; the data
// layer's behaviour is what we're exercising here. We do this BEFORE
// importing the module under test so the lazy `getSupabaseAdmin()`
// inside `revokeTrustedDevice` resolves to the stub.
vi.mock("../../src/server/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    auth: { admin: { signOut: async (_id: string) => ({ error: null }) } },
  }),
}))

import {
  findCurrentDeviceId,
  hashCookieValue,
  labelFromUserAgent,
  listTrustedDevices,
  recognizeOrRegister,
  revokeAllTrustedDevices,
  revokeTrustedDevice,
} from "../../src/server/trusted-devices"

const USER_A = "user-a"
const USER_B = "user-b"
const UA_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Chrome/121.0 Safari/605.1.15"
const UA_FIREFOX =
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0"

beforeAll(async () => {
  const db = getDb()
  // Seed two distinct user rows ; the FK on TrustedDevice.userId
  // requires real users.
  await db.user.upsert({
    where: { id: USER_A },
    create: { id: USER_A, email: "a@x.test" },
    update: {},
  })
  await db.user.upsert({
    where: { id: USER_B },
    create: { id: USER_B, email: "b@x.test" },
    update: {},
  })
})

afterEach(async () => {
  const db = getDb()
  // DeviceSession FKs to TrustedDevice ; CASCADE on the truncate.
  await truncate(db, ["DeviceSession", "TrustedDevice"])
})

describe("recognizeOrRegister — first-time registration", () => {
  it("creates a new device row + returns the raw cookie", async () => {
    const result = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: "203.0.113.1",
      country: "CA",
      clientHints: { model: "MacBookPro18,2", platformVersion: "14.0.0" },
      existingCookieValue: null,
    })
    expect(result.isNew).toBe(true)
    expect(result.rawCookieValue).toBeTruthy()
    expect(result.device.userId).toBe(USER_A)
    expect(result.device.label).toBe("Chrome on macOS")
    expect(result.device.firstSeenIp).toBe("203.0.113.1")
    expect(result.device.country).toBe("CA")
    expect(result.device.cookieHash).toBe(hashCookieValue(result.rawCookieValue!))
  })

  it("persists the row so subsequent reads see it", async () => {
    const created = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
    })
    const db = getDb()
    const found = await db.trustedDevice.findUnique({
      where: { id: created.device.id },
    })
    expect(found).not.toBeNull()
    expect(found?.userId).toBe(USER_A)
  })

  it("creates a DeviceSession row when supabaseSessionId is provided", async () => {
    const result = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
      supabaseSessionId: "session-abc",
    })
    const db = getDb()
    const sessions = await db.deviceSession.findMany({
      where: { deviceId: result.device.id },
    })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.supabaseSessionId).toBe("session-abc")
  })

  it("skips DeviceSession creation when supabaseSessionId is null", async () => {
    const result = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
      supabaseSessionId: null,
    })
    const db = getDb()
    const sessions = await db.deviceSession.findMany({
      where: { deviceId: result.device.id },
    })
    expect(sessions).toHaveLength(0)
  })
})

describe("recognizeOrRegister — recognition of an existing cookie", () => {
  it("re-uses the row + returns null for rawCookieValue", async () => {
    const first = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: "203.0.113.1",
      existingCookieValue: null,
    })
    const second = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: "203.0.113.5",
      existingCookieValue: first.rawCookieValue,
    })
    expect(second.isNew).toBe(false)
    expect(second.rawCookieValue).toBeNull()
    expect(second.device.id).toBe(first.device.id)
    // lastSeenIp updates on every recognized seen.
    expect(second.device.lastSeenIp).toBe("203.0.113.5")
  })

  it("refreshes country when the caller provides a fresh value", async () => {
    const first = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      country: "CA",
      existingCookieValue: null,
    })
    const second = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      country: "FR",
      existingCookieValue: first.rawCookieValue,
    })
    expect(second.device.country).toBe("FR")
  })

  it("treats null country as 'no fresh signal' — keeps the previous value", async () => {
    const first = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      country: "CA",
      existingCookieValue: null,
    })
    const second = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      country: null,
      existingCookieValue: first.rawCookieValue,
    })
    expect(second.device.country).toBe("CA")
  })

  it("creates a fresh row when the cookie hash matches a different user", async () => {
    // User-A has the cookie. User-B presents it (impossible without a
    // leak ; we still return a fresh row tied to the right user).
    const a = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
    })
    const b = await recognizeOrRegister({
      userId: USER_B,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: a.rawCookieValue,
    })
    expect(b.isNew).toBe(true)
    expect(b.rawCookieValue).not.toBeNull()
    expect(b.device.userId).toBe(USER_B)
    expect(b.device.id).not.toBe(a.device.id)
  })

  it("creates a fresh row when the existing record was revoked", async () => {
    const first = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
    })
    await revokeTrustedDevice({ userId: USER_A, deviceId: first.device.id })
    const second = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: first.rawCookieValue,
    })
    expect(second.isNew).toBe(true)
    expect(second.device.id).not.toBe(first.device.id)
  })

  it("upserts the DeviceSession (idempotent on supabaseSessionId)", async () => {
    const first = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
      supabaseSessionId: "sess-1",
    })
    await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: first.rawCookieValue,
      supabaseSessionId: "sess-1",
    })
    const db = getDb()
    const count = await db.deviceSession.count({
      where: { deviceId: first.device.id },
    })
    expect(count).toBe(1)
  })
})

describe("listTrustedDevices", () => {
  it("returns only non-revoked devices for the given user, newest-seen first", async () => {
    const earlier = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
    })
    // Force lastSeenAt to be older than the next device's so the
    // ordering check below isn't a tie.
    const db = getDb()
    await db.trustedDevice.update({
      where: { id: earlier.device.id },
      data: { lastSeenAt: new Date(Date.now() - 60_000) },
    })
    const newer = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_FIREFOX,
      ip: null,
      existingCookieValue: null,
    })
    // A revoked device that should NOT appear.
    const revoked = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
    })
    await revokeTrustedDevice({ userId: USER_A, deviceId: revoked.device.id })

    const list = await listTrustedDevices(USER_A)
    expect(list.map((d) => d.id)).toEqual([newer.device.id, earlier.device.id])
  })

  it("scopes to userId — never leaks another user's devices", async () => {
    await recognizeOrRegister({
      userId: USER_B,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
    })
    const list = await listTrustedDevices(USER_A)
    expect(list).toHaveLength(0)
  })
})

describe("findCurrentDeviceId", () => {
  it("returns the matching device's id when the cookie matches", async () => {
    const created = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
    })
    const id = await findCurrentDeviceId({
      userId: USER_A,
      cookieValue: created.rawCookieValue,
    })
    expect(id).toBe(created.device.id)
  })

  it("returns null when the cookie value is null", async () => {
    const id = await findCurrentDeviceId({ userId: USER_A, cookieValue: null })
    expect(id).toBeNull()
  })

  it("returns null when the cookie matches a revoked device", async () => {
    const created = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
    })
    await revokeTrustedDevice({ userId: USER_A, deviceId: created.device.id })
    const id = await findCurrentDeviceId({
      userId: USER_A,
      cookieValue: created.rawCookieValue,
    })
    expect(id).toBeNull()
  })
})

describe("revokeTrustedDevice", () => {
  it("stamps revokedAt + clears the device's DeviceSession rows", async () => {
    const created = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
      supabaseSessionId: "sess-1",
    })
    await revokeTrustedDevice({
      userId: USER_A,
      deviceId: created.device.id,
    })
    const db = getDb()
    const row = await db.trustedDevice.findUnique({
      where: { id: created.device.id },
    })
    expect(row?.revokedAt).not.toBeNull()
    const sessions = await db.deviceSession.count({
      where: { deviceId: created.device.id },
    })
    expect(sessions).toBe(0)
  })

  it("is a no-op when the device belongs to a different user", async () => {
    const a = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
    })
    await revokeTrustedDevice({ userId: USER_B, deviceId: a.device.id })
    const db = getDb()
    const row = await db.trustedDevice.findUnique({
      where: { id: a.device.id },
    })
    expect(row?.revokedAt).toBeNull()
  })

  it("is idempotent — calling twice doesn't bump revokedAt forward", async () => {
    const created = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
    })
    await revokeTrustedDevice({ userId: USER_A, deviceId: created.device.id })
    const db = getDb()
    const firstStamp = (
      await db.trustedDevice.findUnique({ where: { id: created.device.id } })
    )?.revokedAt
    await revokeTrustedDevice({ userId: USER_A, deviceId: created.device.id })
    const secondStamp = (
      await db.trustedDevice.findUnique({ where: { id: created.device.id } })
    )?.revokedAt
    expect(secondStamp?.getTime()).toBe(firstStamp?.getTime())
  })
})

describe("revokeAllTrustedDevices", () => {
  it("revokes every active device for the user + returns the count", async () => {
    const a1 = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
    })
    const a2 = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_FIREFOX,
      ip: null,
      existingCookieValue: null,
    })
    // One already-revoked row that shouldn't count.
    const a3 = await recognizeOrRegister({
      userId: USER_A,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
    })
    await revokeTrustedDevice({ userId: USER_A, deviceId: a3.device.id })

    const result = await revokeAllTrustedDevices({ userId: USER_A })
    expect(result).toBe(2)

    const list = await listTrustedDevices(USER_A)
    expect(list).toHaveLength(0)
    // a1 + a2 are revoked.
    const db = getDb()
    const a1Row = await db.trustedDevice.findUnique({
      where: { id: a1.device.id },
    })
    const a2Row = await db.trustedDevice.findUnique({
      where: { id: a2.device.id },
    })
    expect(a1Row?.revokedAt).not.toBeNull()
    expect(a2Row?.revokedAt).not.toBeNull()
  })

  it("scopes to the user — never touches another user's devices", async () => {
    await recognizeOrRegister({
      userId: USER_B,
      userAgent: UA_CHROME,
      ip: null,
      existingCookieValue: null,
    })
    const result = await revokeAllTrustedDevices({ userId: USER_A })
    expect(result).toBe(0)
    const otherList = await listTrustedDevices(USER_B)
    expect(otherList).toHaveLength(1)
  })

  it("returns 0 when the user has no active devices", async () => {
    const result = await revokeAllTrustedDevices({ userId: USER_A })
    expect(result).toBe(0)
  })
})

describe("UA label parsing — pure, no DB", () => {
  it("returns 'Chrome on macOS' for a typical macOS Chrome UA", () => {
    expect(labelFromUserAgent(UA_CHROME)).toMatch(/Chrome on macOS|Chrome on Mac OS/)
  })

  it("falls back to 'Unknown device' when the UA is empty", () => {
    expect(labelFromUserAgent("")).toBe("Unknown device")
  })
})
