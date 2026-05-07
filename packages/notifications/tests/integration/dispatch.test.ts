import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { getDb } from "@monark/db"
import { truncate } from "@monark/test-utils/db"
import { notify, notifyMany } from "../../src/server/dispatch"
import {
  isChannelEnabled,
  listPreferences,
  resetPreferences,
  setPreference,
} from "../../src/server/prefs"
import { _resetTransportCacheForTesting } from "../../src/server/transport/email"

// Integration tests for the dispatch + prefs path. The SMTP transport
// is left unconfigured (no `SMTP_URL` on the env) so `sendMail`
// short-circuits to a log-only success ; that's enough to exercise
// the dispatch path's "delivered" stamping + dedupe logic without
// running a real smtp-tester. The unit suite already covers
// nodemailer interaction.
//
// Each spec works against a freshly-truncated Notification +
// NotificationPreference table ; users are upserted in `beforeAll`
// so every case starts from the same recipient pool.

const USER_EN = "user-en"
const USER_FR = "user-fr"
const USER_DELETED = "user-deleted"

beforeAll(async () => {
  delete process.env.SMTP_URL
  _resetTransportCacheForTesting()
  const db = getDb()
  await db.user.upsert({
    where: { id: USER_EN },
    create: {
      id: USER_EN,
      email: "en@x.test",
      displayName: "EN User",
      localePreference: "en",
    },
    update: {},
  })
  await db.user.upsert({
    where: { id: USER_FR },
    create: {
      id: USER_FR,
      email: "fr@x.test",
      displayName: "FR User",
      localePreference: "fr",
    },
    update: {},
  })
  await db.user.upsert({
    where: { id: USER_DELETED },
    create: {
      id: USER_DELETED,
      email: "deleted@x.test",
      displayName: "Deleted",
      deletedAt: new Date(),
    },
    update: { deletedAt: new Date() },
  })
})

beforeEach(() => {
  _resetTransportCacheForTesting()
})

afterEach(async () => {
  const db = getDb()
  await truncate(db, ["Notification", "NotificationPreference"])
})

describe("notify — happy path", () => {
  it("persists one Notification per channel and stamps deliveredAt on EMAIL", async () => {
    const result = await notify(
      "auth.password-changed",
      { userId: USER_EN },
      { occurredAt: new Date() },
    )
    expect(result.deliveryIds).toHaveLength(2)
    expect(result.skipped).toEqual([])

    const db = getDb()
    const rows = await db.notification.findMany({
      where: { userId: USER_EN },
      orderBy: { channel: "asc" },
    })
    expect(rows).toHaveLength(2)
    const email = rows.find((r) => r.channel === "EMAIL")
    const inApp = rows.find((r) => r.channel === "IN_APP")
    expect(email?.deliveredAt).not.toBeNull()
    expect(email?.failedAt).toBeNull()
    expect(email?.body).toBeNull()
    // IN_APP rows always carry an inline body the bell can render.
    expect(inApp?.body).toBeTruthy()
  })

  it("renders the recipient's locale on the subject", async () => {
    await notify(
      "auth.password-changed",
      { userId: USER_FR },
      { occurredAt: new Date() },
    )
    const db = getDb()
    const row = await db.notification.findFirst({
      where: { userId: USER_FR, channel: "IN_APP" },
    })
    expect(row?.subject).toBeTruthy()
    // FR template strings always include accented characters somewhere ;
    // a bare ASCII subject would mean we routed the EN copy to a FR user.
    expect(row?.subject).toMatch(/[éèàùç]/i)
  })
})

describe("notify — dedupe window", () => {
  it("skips a duplicate kind+payload within the 60s window", async () => {
    const data = { occurredAt: new Date("2026-05-05T10:00:00Z") }
    const first = await notify(
      "auth.password-changed",
      { userId: USER_EN },
      data,
    )
    expect(first.deliveryIds).toHaveLength(2)

    const second = await notify(
      "auth.password-changed",
      { userId: USER_EN },
      data,
    )
    expect(second.deliveryIds).toHaveLength(0)
    expect(second.skipped.map((s) => s.reason)).toEqual([
      "duplicate-within-window",
      "duplicate-within-window",
    ])
  })

  it("does not dedupe across distinct payloads (different occurredAt)", async () => {
    await notify(
      "auth.password-changed",
      { userId: USER_EN },
      { occurredAt: new Date("2026-05-05T10:00:00Z") },
    )
    const second = await notify(
      "auth.password-changed",
      { userId: USER_EN },
      { occurredAt: new Date("2026-05-05T10:05:00Z") },
    )
    expect(second.deliveryIds).toHaveLength(2)
  })

  it("does not dedupe across users", async () => {
    const data = { occurredAt: new Date("2026-05-05T10:00:00Z") }
    await notify("auth.password-changed", { userId: USER_EN }, data)
    const result = await notify(
      "auth.password-changed",
      { userId: USER_FR },
      data,
    )
    expect(result.deliveryIds).toHaveLength(2)
  })
})

describe("notify — soft-deleted recipient", () => {
  it("delivers IN_APP only and skips EMAIL with reason 'user-soft-deleted'", async () => {
    const result = await notify(
      "account.deletion-scheduled",
      { userId: USER_DELETED },
      { completesAt: new Date("2026-05-19") },
    )
    // Only one delivery (IN_APP) ; EMAIL skipped.
    expect(result.deliveryIds).toHaveLength(1)
    expect(result.skipped).toContainEqual({
      channel: "EMAIL",
      reason: "user-soft-deleted",
    })
    const db = getDb()
    const rows = await db.notification.findMany({
      where: { userId: USER_DELETED },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.channel).toBe("IN_APP")
  })
})

describe("notify — opt-out semantics", () => {
  it("skips an opt-out-eligible channel when the user disabled it", async () => {
    // account.email-changed is IN_APP-only and not requiredEmail ; the
    // user disabling ACCOUNT/IN_APP should suppress the row entirely.
    await setPreference({
      userId: USER_EN,
      category: "ACCOUNT",
      channel: "IN_APP",
      enabled: false,
    })
    const result = await notify(
      "account.email-changed",
      { userId: USER_EN },
      {
        previousEmail: "old@x.test",
        newEmail: "new@x.test",
        occurredAt: new Date(),
      },
    )
    expect(result.deliveryIds).toHaveLength(0)
    expect(result.skipped[0]?.reason).toBe("user-opted-out")
  })

  it("forces EMAIL through even when the override row is disabled (requiredEmail)", async () => {
    await setPreference({
      userId: USER_EN,
      category: "SECURITY",
      channel: "EMAIL",
      enabled: false,
    })
    const result = await notify(
      "auth.password-changed",
      { userId: USER_EN },
      { occurredAt: new Date() },
    )
    // Both channels still deliver — requiredEmail overrides the user pref.
    expect(result.deliveryIds).toHaveLength(2)
  })
})

describe("notify — unknown recipient", () => {
  it("returns an empty result without throwing when the user is missing", async () => {
    const result = await notify(
      "auth.password-changed",
      { userId: "no-such-user" },
      { occurredAt: new Date() },
    )
    expect(result).toEqual({ deliveryIds: [], skipped: [] })
  })
})

describe("notifyMany — fan-out", () => {
  it("aggregates deliveryIds across each recipient", async () => {
    const result = await notifyMany(
      "auth.password-changed",
      [{ userId: USER_EN }, { userId: USER_FR }],
      { occurredAt: new Date() },
    )
    // 2 recipients × 2 channels = 4 deliveries.
    expect(result.deliveryIds).toHaveLength(4)
  })
})

describe("preferences round-trip", () => {
  it("setPreference upserts a single row + isChannelEnabled reads it", async () => {
    await setPreference({
      userId: USER_EN,
      category: "ACCOUNT",
      channel: "IN_APP",
      enabled: false,
    })
    const enabled = await isChannelEnabled({
      userId: USER_EN,
      kind: "account.email-changed",
      channel: "IN_APP",
    })
    expect(enabled).toBe(false)

    // Flip back ; same compound key, second upsert path.
    await setPreference({
      userId: USER_EN,
      category: "ACCOUNT",
      channel: "IN_APP",
      enabled: true,
    })
    const list = await listPreferences(USER_EN)
    expect(list).toHaveLength(1)
    expect(list[0]?.enabled).toBe(true)
  })

  it("isChannelEnabled falls back to registry default when no row exists", async () => {
    const list = await listPreferences(USER_EN)
    expect(list).toHaveLength(0)
    const enabled = await isChannelEnabled({
      userId: USER_EN,
      kind: "account.email-changed",
      channel: "IN_APP",
    })
    // account.email-changed defaults IN_APP=true.
    expect(enabled).toBe(true)
  })

  it("resetPreferences clears every override row for the user", async () => {
    await setPreference({
      userId: USER_EN,
      category: "ACCOUNT",
      channel: "IN_APP",
      enabled: false,
    })
    await setPreference({
      userId: USER_EN,
      category: "SECURITY",
      channel: "IN_APP",
      enabled: false,
    })
    expect((await listPreferences(USER_EN))).toHaveLength(2)
    await resetPreferences(USER_EN)
    expect((await listPreferences(USER_EN))).toHaveLength(0)
  })

  it("does not leak prefs across users", async () => {
    await setPreference({
      userId: USER_EN,
      category: "ACCOUNT",
      channel: "IN_APP",
      enabled: false,
    })
    const otherList = await listPreferences(USER_FR)
    expect(otherList).toHaveLength(0)
  })
})
