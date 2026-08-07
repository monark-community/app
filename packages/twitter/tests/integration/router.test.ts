import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { t } from "@monark/common/trpc";
import { assignRole } from "@monark/rbac/server";
import { twitterRouter } from "../../src/server/index";
import { registerTwitterPermissions } from "../../src/server/permissions";

// The Twitter/X connection surface, exercised through the REAL tRPC procedures.
// Proves: `twitter.manage` gates every op (ADMIN short-circuits), and the
// connect → status(connected) → disconnect → status(disconnected) round-trip
// stores + clears all four OAuth 1.0a credential secrets. connect is store-only
// (no live X call), so no network mock is needed.

const ORG = "twitter-authz-org";
const U_ADMIN = "twitter-authz-admin"; // built-in ADMIN
const U_NONE = "twitter-authz-none"; // org member, no role
const ADMIN_BUILTIN_ID = "role_admin_builtin";

const createCaller = t.createCallerFactory(twitterRouter);
const callerFor = (userId: string, orgId: string | null) =>
  createCaller({ userId, activeOrganizationId: orgId, requestId: "twitter-authz" });

const CREDS = {
  consumerKey: "ck-123",
  consumerSecret: "cs-456",
  accessToken: "at-789",
  accessTokenSecret: "ats-000",
};

beforeAll(async () => {
  const db = getDb();
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: [U_ADMIN, U_NONE] } } });

  registerTwitterPermissions();

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

describe("twitter.connection", () => {
  it("denies status / connect / disconnect without twitter.manage", async () => {
    const none = callerFor(U_NONE, ORG);
    await expect(none.connection.status()).rejects.toThrow();
    await expect(none.connection.connect(CREDS)).rejects.toThrow();
    await expect(none.connection.disconnect()).rejects.toThrow();
  });

  it("round-trips connect → status → disconnect as an admin", async () => {
    const admin = callerFor(U_ADMIN, ORG);

    expect((await admin.connection.status()).connected).toBe(false);

    const res = await admin.connection.connect(CREDS);
    expect(res.ok).toBe(true);

    expect((await admin.connection.status()).connected).toBe(true);
    // all four credential secrets landed
    const db = getDb();
    expect(await db.secret.count({ where: { organizationId: ORG } })).toBe(4);

    await admin.connection.disconnect();
    expect((await admin.connection.status()).connected).toBe(false);
  });
});
