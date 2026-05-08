import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { emit } from "@monark/common"
import { _resetHandlersForTesting } from "@monark/common/events"
import { getDb } from "@monark/db"
import { truncate } from "@monark/test-utils/db"
import { ADMIN_ROLE_KEY, SYSADMIN_ROLE_KEY } from "@monark/rbac/server"

// `notify` is mocked at the module-import boundary so the spec only
// has to assert the wiring contract (each event → matching kind +
// recipient + data shape). The dispatch integration suite covers
// notify's actual side effects (Notification rows, SMTP send,
// `deliveredAt` stamping) and stays the canonical home for those.
const notifyMock = vi.fn().mockResolvedValue({ delivered: 1 })
vi.mock("../../src/server/dispatch", () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
  notifyMany: vi.fn().mockResolvedValue({ delivered: 0 }),
}))

import {
  registerNotificationSubscribers,
  _resetSubscribersForTesting,
} from "../../src/server/subscribers"

const ORG_A = "test-org-subs-a"
const ORG_B = "test-org-subs-b"

beforeAll(async () => {
  const db = getDb()
  for (const id of [ORG_A, ORG_B]) {
    await db.organization.upsert({
      where: { id },
      create: { id, slug: id, displayName: id },
      update: {},
    })
  }
})

// Find-or-create for built-in roles. Prisma rejects null in compound-
// unique `where` clauses ; `@@unique([key, organizationId])` includes
// a nullable column. `findFirst` allows null and is what we use here.
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

beforeEach(async () => {
  // Clear the bus, the spy, and the subscriber-registered flag so
  // each spec exercises a clean wiring.
  _resetHandlersForTesting()
  _resetSubscribersForTesting()
  notifyMock.mockClear()
  registerNotificationSubscribers()
  // Re-seed the built-in roles : `afterEach` truncates `Role` so the
  // platform-tier rows the operator-alert specs look up via
  // `findRoleByKey` would be missing on subsequent specs without
  // this.
  await ensureBuiltInRole(SYSADMIN_ROLE_KEY, "System Administrator")
  await ensureBuiltInRole(ADMIN_ROLE_KEY, "Administrator")
})

afterEach(async () => {
  // Drop everything writable so the next spec's seed is clean.
  await truncate(getDb(), [
    "TrustedDevice",
    "WebhookEndpoint",
    "RoleAssignment",
    "Role",
    "User",
  ])
})

async function seedUser(id: string): Promise<string> {
  const db = getDb()
  await db.user.create({ data: { id, email: `${id}@test.local` } })
  return id
}

async function findRoleByKey(
  key: string,
  orgId: string | null,
): Promise<string> {
  const db = getDb()
  const row = await db.role.findFirst({
    where: { key, organizationId: orgId },
    select: { id: true },
  })
  if (!row) throw new Error(`role ${key} missing`)
  return row.id
}

describe("notifications/subscribers — auth events", () => {
  it("`trusted-device.added` → notify(auth.new-device) with the device shape", async () => {
    const userId = await seedUser("u-td")
    const db = getDb()
    const device = await db.trustedDevice.create({
      data: {
        userId,
        cookieHash: "hash-1",
        userAgent: "Mozilla/5.0 (Pixel 9)",
        label: "Pixel 9",
        lastSeenIp: "1.2.3.4",
        country: "FR",
        lastSeenAt: new Date("2026-05-01T12:00:00Z"),
      },
    })
    await emit({
      type: "trusted-device.added",
      userId,
      deviceId: device.id,
      userAgent: "Mozilla/5.0 (Pixel 9)",
      occurredAt: new Date(),
    })
    expect(notifyMock).toHaveBeenCalledWith(
      "auth.new-device",
      { userId },
      expect.objectContaining({
        deviceLabel: "Pixel 9",
        deviceCountry: "FR",
        deviceIp: "1.2.3.4",
      }),
    )
  })

  it("`trusted-device.added` is silent when the device row no longer exists", async () => {
    const userId = await seedUser("u-td-missing")
    await emit({
      type: "trusted-device.added",
      userId,
      deviceId: "does-not-exist",
      userAgent: "Mozilla/5.0",
      occurredAt: new Date(),
    })
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it("`user.password-changed` → notify(auth.password-changed)", async () => {
    const userId = await seedUser("u-pw")
    const occurredAt = new Date()
    await emit({
      type: "user.password-changed",
      userId,
      triggeredBy: "user",
      occurredAt,
    })
    expect(notifyMock).toHaveBeenCalledWith(
      "auth.password-changed",
      { userId },
      { occurredAt },
    )
  })

  it("`totp.enabled` → notify(auth.totp-enabled)", async () => {
    const userId = await seedUser("u-totp-on")
    const occurredAt = new Date()
    await emit({ type: "totp.enabled", userId, occurredAt })
    expect(notifyMock).toHaveBeenCalledWith(
      "auth.totp-enabled",
      { userId },
      { occurredAt },
    )
  })

  it("`totp.disabled` → notify(auth.totp-disabled)", async () => {
    const userId = await seedUser("u-totp-off")
    const occurredAt = new Date()
    await emit({
      type: "totp.disabled",
      userId,
      triggeredBy: "user",
      occurredAt,
    })
    expect(notifyMock).toHaveBeenCalledWith(
      "auth.totp-disabled",
      { userId },
      { occurredAt },
    )
  })

  it("`trusted-devices.all-revoked` → notify(auth.all-devices-revoked)", async () => {
    const userId = await seedUser("u-rev")
    const occurredAt = new Date()
    await emit({
      type: "trusted-devices.all-revoked",
      userId,
      count: 3,
      scope: "user",
      occurredAt,
    })
    expect(notifyMock).toHaveBeenCalledWith(
      "auth.all-devices-revoked",
      { userId },
      { count: 3, occurredAt },
    )
  })
})

describe("notifications/subscribers — account lifecycle events", () => {
  it("`user.email-changed` → notify(account.email-changed) with both addresses", async () => {
    const userId = await seedUser("u-email")
    const occurredAt = new Date()
    await emit({
      type: "user.email-changed",
      userId,
      previousEmail: "old@test.local",
      newEmail: "new@test.local",
      occurredAt,
    })
    expect(notifyMock).toHaveBeenCalledWith(
      "account.email-changed",
      { userId },
      {
        previousEmail: "old@test.local",
        newEmail: "new@test.local",
        occurredAt,
      },
    )
  })

  it("`user.deletion-requested` → notify(account.deletion-scheduled) with the completes-at", async () => {
    const userId = await seedUser("u-del-req")
    const completesAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    await emit({
      type: "user.deletion-requested",
      userId,
      requestedAt: new Date(),
      deletionCompletesAt: completesAt,
      occurredAt: new Date(),
    })
    expect(notifyMock).toHaveBeenCalledWith(
      "account.deletion-scheduled",
      { userId },
      { completesAt },
    )
  })

  it("`user.deletion-canceled` → notify(account.deletion-canceled)", async () => {
    const userId = await seedUser("u-del-cancel")
    const occurredAt = new Date()
    await emit({
      type: "user.deletion-canceled",
      userId,
      occurredAt,
    })
    expect(notifyMock).toHaveBeenCalledWith(
      "account.deletion-canceled",
      { userId },
      { occurredAt },
    )
  })
})

describe("notifications/subscribers — webhook operator alerts", () => {
  it("permanent `webhook.delivery-failed` for org-scoped endpoint fans out to org admins", async () => {
    const adminA = await seedUser("u-admin-a-1")
    const adminB = await seedUser("u-admin-a-2")
    const adminOtherOrg = await seedUser("u-admin-b")
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null)
    const db = getDb()
    for (const userId of [adminA, adminB]) {
      await db.roleAssignment.create({
        data: { userId, roleId: adminRoleId, organizationId: ORG_A },
      })
    }
    // Admin in a different org — should NOT receive the alert.
    await db.roleAssignment.create({
      data: {
        userId: adminOtherOrg,
        roleId: adminRoleId,
        organizationId: ORG_B,
      },
    })
    const occurredAt = new Date()
    await emit({
      type: "webhook.delivery-failed",
      organizationId: ORG_A,
      endpointId: "ep-1",
      endpointUrl: "https://hook.test",
      deliveryId: "d-1",
      eventType: "auth.signed-in",
      attemptNumber: 5,
      reason: "timeout",
      permanent: true,
      occurredAt,
    })
    const recipients = notifyMock.mock.calls
      .filter((c) => c[0] === "webhooks.delivery-permanently-failed")
      .map((c) => (c[1] as { userId: string }).userId)
    expect(recipients.sort()).toEqual([adminA, adminB].sort())
    // Each call carries the org-scope hint + endpoint context.
    const firstPayload = notifyMock.mock.calls.find(
      (c) => c[0] === "webhooks.delivery-permanently-failed",
    )?.[2] as Record<string, unknown> | undefined
    expect(firstPayload).toMatchObject({
      endpointId: "ep-1",
      endpointUrl: "https://hook.test",
      eventType: "auth.signed-in",
      attempts: 5,
      reason: "timeout",
      scope: "org",
    })
  })

  it("`webhook.delivery-failed` is silent when `permanent` is false", async () => {
    await emit({
      type: "webhook.delivery-failed",
      organizationId: ORG_A,
      endpointId: "ep-1",
      endpointUrl: "https://hook.test",
      deliveryId: "d-2",
      eventType: "auth.signed-in",
      attemptNumber: 1,
      reason: "503",
      permanent: false,
      occurredAt: new Date(),
    })
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it("permanent `webhook.delivery-failed` for platform-tier endpoint fans out to sysadmins with scope=platform", async () => {
    const sysadmin = await seedUser("u-sa")
    const sysadminRoleId = await findRoleByKey(SYSADMIN_ROLE_KEY, null)
    const db = getDb()
    await db.roleAssignment.create({
      data: { userId: sysadmin, roleId: sysadminRoleId, organizationId: null },
    })
    await emit({
      type: "webhook.delivery-failed",
      organizationId: null,
      endpointId: "ep-platform",
      endpointUrl: "https://platform.test",
      deliveryId: "d-3",
      eventType: "rbac.role-assigned",
      attemptNumber: 5,
      reason: "exhausted",
      permanent: true,
      occurredAt: new Date(),
    })
    const calls = notifyMock.mock.calls.filter(
      (c) => c[0] === "webhooks.delivery-permanently-failed",
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[1]).toEqual({ userId: sysadmin })
    expect(calls[0]?.[2]).toMatchObject({ scope: "platform" })
  })

  it("`webhook.endpoint-disabled-after-failures` → notify(webhooks.endpoint-auto-disabled) with looked-up URL", async () => {
    const admin = await seedUser("u-admin-disable")
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null)
    const db = getDb()
    await db.roleAssignment.create({
      data: { userId: admin, roleId: adminRoleId, organizationId: ORG_A },
    })
    const endpoint = await db.webhookEndpoint.create({
      data: {
        organizationId: ORG_A,
        name: "Test endpoint",
        url: "https://endpoint.test/hook",
        secretHash: "h",
      },
    })
    await emit({
      type: "webhook.endpoint-disabled-after-failures",
      endpointId: endpoint.id,
      organizationId: ORG_A,
      consecutiveFailures: 5,
      occurredAt: new Date(),
    })
    const call = notifyMock.mock.calls.find(
      (c) => c[0] === "webhooks.endpoint-auto-disabled",
    )
    expect(call).toBeDefined()
    expect(call?.[1]).toEqual({ userId: admin })
    expect(call?.[2]).toMatchObject({
      endpointId: endpoint.id,
      endpointUrl: "https://endpoint.test/hook",
      consecutiveFailures: 5,
      scope: "org",
    })
  })

  it("`webhook.endpoint-disabled-after-failures` falls back to sentinel URL when the endpoint row was already deleted", async () => {
    const admin = await seedUser("u-admin-deleted")
    const adminRoleId = await findRoleByKey(ADMIN_ROLE_KEY, null)
    const db = getDb()
    await db.roleAssignment.create({
      data: { userId: admin, roleId: adminRoleId, organizationId: ORG_A },
    })
    await emit({
      type: "webhook.endpoint-disabled-after-failures",
      endpointId: "ep-vanished",
      organizationId: ORG_A,
      consecutiveFailures: 5,
      occurredAt: new Date(),
    })
    const call = notifyMock.mock.calls.find(
      (c) => c[0] === "webhooks.endpoint-auto-disabled",
    )
    expect(call?.[2]).toMatchObject({
      endpointId: "ep-vanished",
      endpointUrl: "(deleted endpoint)",
    })
  })
})

describe("notifications/subscribers — registration idempotency", () => {
  it("calling registerNotificationSubscribers twice doesn't double-bind handlers", async () => {
    // beforeEach already called register once. Calling again must
    // be a no-op (the in-memory bus would otherwise dispatch each
    // handler twice and notifyMock would see double calls).
    registerNotificationSubscribers()
    const userId = await seedUser("u-double")
    const occurredAt = new Date()
    await emit({
      type: "user.password-changed",
      userId,
      triggeredBy: "user",
      occurredAt,
    })
    expect(
      notifyMock.mock.calls.filter((c) => c[0] === "auth.password-changed"),
    ).toHaveLength(1)
  })
})
