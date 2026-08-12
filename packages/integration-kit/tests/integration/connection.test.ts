import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { t } from "@monark/common/trpc";
import { assignRole } from "@monark/rbac/server";
import { listSecrets } from "@monark/secrets/server";
import { makeConnectionSecretRouter } from "../../src/server/connection";

// The shared per-org "connection" router (status / generate-secret / disconnect)
// every webhook integration mounts, driven through the real tRPC caller against
// a real Postgres + the secrets substrate. Proves the RBAC gate, the
// connected/webhook-path reporting, and the write-only signing-secret lifecycle
// (mint → rotate → disconnect).

const ORG = "ik-conn-org";
const ADMIN = "ik-conn-admin"; // ADMIN → passes the manage permission
const MEMBER = "ik-conn-member"; // member, no role → forbidden
const ADMIN_BUILTIN_ID = "role_admin_builtin";
const SECRET_KEY = "demo.webhook-secret";

const router = makeConnectionSecretRouter({
  secretKey: SECRET_KEY,
  permission: "demo.manage",
  webhookPathPrefix: "/hooks/demo",
  secretDescription: "Demo signing secret",
});
const createCaller = t.createCallerFactory(router);
const callerFor = (userId: string | undefined) =>
  createCaller({ userId, activeOrganizationId: ORG, requestId: "ik-conn-test" });

async function cleanup() {
  const db = getDb();
  await db.secret.deleteMany({ where: { organizationId: ORG } }).catch(() => {});
  await db.roleAssignment.deleteMany({ where: { userId: { in: [ADMIN, MEMBER] } } });
  await db.organizationMembership.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: [ADMIN, MEMBER] } } });
}

beforeAll(async () => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const db = getDb();
  await cleanup();
  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  for (const id of [ADMIN, MEMBER]) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }
  await db.role.upsert({
    where: { id: ADMIN_BUILTIN_ID },
    create: {
      id: ADMIN_BUILTIN_ID,
      key: "ADMIN",
      name: "Administrator",
      builtIn: true,
      organizationId: null,
    },
    update: {},
  });
  await assignRole({
    userId: ADMIN,
    roleId: ADMIN_BUILTIN_ID,
    organizationId: ORG,
    grantedById: null,
  });
});

afterAll(cleanup);

describe("makeConnectionSecretRouter", () => {
  it("reports not-connected with the org-scoped webhook path before setup", async () => {
    const res = await callerFor(ADMIN).status();
    expect(res).toEqual({ connected: false, webhookPath: `/hooks/demo/${ORG}` });
  });

  it("mints a write-only signing secret, then reports connected", async () => {
    const res = await callerFor(ADMIN).generateWebhookSecret();
    expect(res.secret).toMatch(/.+/);
    expect(res.webhookPath).toBe(`/hooks/demo/${ORG}`);
    // Stored under the configured key ; the value is write-only (listSecrets
    // never returns it).
    const secrets = await listSecrets(ORG);
    const row = secrets.find((s) => s.key === SECRET_KEY);
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).not.toContain(res.secret);

    expect((await callerFor(ADMIN).status()).connected).toBe(true);
  });

  it("rotates the secret on a second generate", async () => {
    const first = await callerFor(ADMIN).generateWebhookSecret();
    const second = await callerFor(ADMIN).generateWebhookSecret();
    expect(second.secret).not.toBe(first.secret);
    // Still a single stored entry for the key (rotate, not append).
    const count = (await listSecrets(ORG)).filter((s) => s.key === SECRET_KEY).length;
    expect(count).toBe(1);
  });

  it("disconnect removes the secret and flips status back", async () => {
    await callerFor(ADMIN).generateWebhookSecret();
    expect(await callerFor(ADMIN).disconnect()).toEqual({ ok: true });
    expect((await callerFor(ADMIN).status()).connected).toBe(false);
  });

  it("rejects an unauthenticated caller and a member without the manage permission", async () => {
    await expect(callerFor(undefined).status()).rejects.toThrow();
    await expect(callerFor(MEMBER).status()).rejects.toThrow();
    await expect(callerFor(MEMBER).generateWebhookSecret()).rejects.toThrow();
  });
});
