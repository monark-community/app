import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { t } from "@monark/common/trpc";
import { assignRole } from "@monark/rbac/server";
import { githubRouter } from "../../src/server/index";
import { registerGithubPermissions } from "../../src/server/permissions";

// The GitHub connection surface, exercised through the REAL tRPC procedures.
// Proves: `github.manage` gates every op (ADMIN short-circuits), and the
// generate → status(connected) → disconnect → status(disconnected) round-trip,
// with the webhook secret returned exactly once.

const ORG = "github-authz-org";
const U_ADMIN = "github-authz-admin"; // built-in ADMIN
const U_NONE = "github-authz-none"; // org member, no role
const ADMIN_BUILTIN_ID = "role_admin_builtin";

const createCaller = t.createCallerFactory(githubRouter);
const callerFor = (userId: string, orgId: string | null) =>
  createCaller({ userId, activeOrganizationId: orgId, requestId: "github-authz" });

beforeAll(async () => {
  const db = getDb();
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: [U_ADMIN, U_NONE] } } });

  registerGithubPermissions();

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

describe("github.connection", () => {
  it("denies status / generate / disconnect without github.manage", async () => {
    const none = callerFor(U_NONE, ORG);
    await expect(none.connection.status()).rejects.toThrow();
    await expect(none.connection.generateWebhookSecret()).rejects.toThrow();
    await expect(none.connection.disconnect()).rejects.toThrow();
  });

  it("round-trips connect → status → disconnect as an admin", async () => {
    const admin = callerFor(U_ADMIN, ORG);

    const before = await admin.connection.status();
    expect(before.connected).toBe(false);
    expect(before.webhookPath).toBe(`/hooks/github/${ORG}`);

    const gen = await admin.connection.generateWebhookSecret();
    expect(gen.secret).toMatch(/^[A-Za-z0-9_-]{20,}$/); // the plaintext, returned once
    expect(gen.webhookPath).toBe(`/hooks/github/${ORG}`);

    const after = await admin.connection.status();
    expect(after.connected).toBe(true);

    await admin.connection.disconnect();
    const gone = await admin.connection.status();
    expect(gone.connected).toBe(false);
  });
});
