import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@monark/db";
import { t } from "@monark/common/trpc";
import { assignRole } from "@monark/rbac/server";
import { telegramRouter } from "../../src/server/index";
import { registerTelegramPermissions } from "../../src/server/permissions";

// The Telegram module's outbound API client is mocked so the connection
// round-trip doesn't hit Telegram over the network : `connect` calls
// `setWebhook` (and `disconnect` calls `deleteWebhook`) through `telegramCall`.
vi.mock("../../src/server/client", () => ({
  telegramCall: vi.fn(async () => true),
}));

// The Telegram connection surface, exercised through the REAL tRPC procedures.
// Proves: `telegram.manage` gates every op (ADMIN short-circuits), and the
// connect → status(connected) → disconnect → status(disconnected) round-trip
// stores + clears both the bot-token and webhook secrets.

const ORG = "telegram-authz-org";
const U_ADMIN = "telegram-authz-admin"; // built-in ADMIN
const U_NONE = "telegram-authz-none"; // org member, no role
const ADMIN_BUILTIN_ID = "role_admin_builtin";

const createCaller = t.createCallerFactory(telegramRouter);
const callerFor = (userId: string, orgId: string | null) =>
  createCaller({ userId, activeOrganizationId: orgId, requestId: "telegram-authz" });

beforeAll(async () => {
  const db = getDb();
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: [U_ADMIN, U_NONE] } } });

  registerTelegramPermissions();

  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  for (const id of [U_ADMIN, U_NONE]) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }
  await assignRole({
    userId: U_ADMIN,
    roleId: ADMIN_BUILTIN_ID,
    organizationId: ORG,
    grantedById: null,
  });
});

afterAll(async () => {
  const db = getDb();
  await db.secret.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: [U_ADMIN, U_NONE] } } });
});

describe("telegram.connection", () => {
  it("denies status / connect / disconnect without telegram.manage", async () => {
    const none = callerFor(U_NONE, ORG);
    await expect(none.connection.status()).rejects.toThrow();
    await expect(
      none.connection.connect({ botToken: "123:abc", apiOrigin: "https://api.example.test" }),
    ).rejects.toThrow();
    await expect(none.connection.disconnect()).rejects.toThrow();
  });

  it("round-trips connect → status → disconnect as an admin", async () => {
    const admin = callerFor(U_ADMIN, ORG);

    const before = await admin.connection.status();
    expect(before.connected).toBe(false);
    expect(before.webhookPath).toBe(`/hooks/telegram/${ORG}`);

    const res = await admin.connection.connect({
      botToken: "123456:test-token",
      apiOrigin: "https://api.example.test/",
    });
    expect(res.ok).toBe(true);
    // org id appended server-side, trailing slash on the origin trimmed
    expect(res.webhookUrl).toBe(`https://api.example.test/hooks/telegram/${ORG}`);

    const after = await admin.connection.status();
    expect(after.connected).toBe(true);
    expect(after.webhookRegistered).toBe(true);

    await admin.connection.disconnect();
    const gone = await admin.connection.status();
    expect(gone.connected).toBe(false);
    expect(gone.webhookRegistered).toBe(false);
  });
});
