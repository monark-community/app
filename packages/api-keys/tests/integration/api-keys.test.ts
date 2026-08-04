import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { authenticateApiKey } from "../../src/server/index";
import { createApiKeyRow, hashKey, mintKey, revokeApiKeyRow } from "../../src/server/data";

// Exercises the security-critical mint + authenticate path : keys are stored as
// a one-way hash (never plaintext), and `authenticateApiKey` accepts only a
// live, non-revoked, non-expired, correctly-prefixed key, resolving it to its
// owner + org. Authority is 100% RBAC (the principal's roles) — there is no
// scope layer. Seeds rows directly (no HTTP / tRPC ctx needed).

const ORG = "apikey-test-org";
const USER = "apikey-test-user";

async function seed(opts: {
  expiresAt?: Date | null;
  revoked?: boolean;
}): Promise<{ plaintext: string; id: string }> {
  const { plaintext, tokenHash, prefix } = mintKey();
  const row = await createApiKeyRow({
    organizationId: ORG,
    ownerUserId: USER,
    name: "test key",
    tokenHash,
    prefix,
    expiresAt: opts.expiresAt ?? null,
    createdBy: USER,
  });
  if (opts.revoked) await revokeApiKeyRow(row.id);
  return { plaintext, id: row.id };
}

beforeAll(async () => {
  const db = getDb();
  await db.apiKey.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: USER } });
  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  await db.user.create({ data: { id: USER, email: `${USER}@test.local` } });
});

afterAll(async () => {
  const db = getDb();
  await db.apiKey.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: USER } });
});

describe("API key mint + authenticate", () => {
  it("stores only the hash, never the plaintext, and prefixes with mrk_", async () => {
    const { plaintext, id } = await seed({});
    const stored = await getDb().apiKey.findUnique({ where: { id } });
    expect(plaintext.startsWith("mrk_")).toBe(true);
    expect(stored?.tokenHash).toBe(hashKey(plaintext));
    expect(JSON.stringify(stored)).not.toContain(plaintext);
  });

  it("authenticates a valid key to its owner + org", async () => {
    const { plaintext } = await seed({});
    const principal = await authenticateApiKey(plaintext);
    expect(principal?.userId).toBe(USER);
    expect(principal?.organizationId).toBe(ORG);
  });

  it("rejects an unknown key", async () => {
    expect(await authenticateApiKey(`mrk_${"x".repeat(43)}`)).toBeNull();
  });

  it("rejects a key without the mrk_ prefix", async () => {
    const { plaintext } = await seed({});
    expect(await authenticateApiKey(plaintext.replace("mrk_", "xxx_"))).toBeNull();
  });

  it("rejects a revoked key", async () => {
    const { plaintext } = await seed({ revoked: true });
    expect(await authenticateApiKey(plaintext)).toBeNull();
  });

  it("rejects an expired key", async () => {
    const { plaintext } = await seed({ expiresAt: new Date(Date.now() - 1000) });
    expect(await authenticateApiKey(plaintext)).toBeNull();
  });

  it("accepts a not-yet-expired key", async () => {
    const { plaintext } = await seed({ expiresAt: new Date(Date.now() + 60_000) });
    expect(await authenticateApiKey(plaintext)).not.toBeNull();
  });

  it("rejects a key whose owner has been disabled", async () => {
    const { plaintext } = await seed({});
    expect(await authenticateApiKey(plaintext)).not.toBeNull();
    await getDb().user.update({ where: { id: USER }, data: { disabledAt: new Date() } });
    expect(await authenticateApiKey(plaintext)).toBeNull();
    await getDb().user.update({ where: { id: USER }, data: { disabledAt: null } });
  });
});
