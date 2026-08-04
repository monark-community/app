import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { t } from "@monark/common/trpc";
import { assignRole } from "@monark/rbac/server";
import { registerFlags, setOverride, syncFlagsToDatabase } from "@monark/feature-flags/server";
import { apiKeysRouter, authenticateApiKey } from "../../src/server/index";
import { registerApiKeysPermissions } from "../../src/server/permissions";

// v2 service accounts, exercised through the REAL tRPC router as an org ADMIN.
// Proves the heart of v2 : a service account is a machine principal whose key
// authenticates AS the account (not a person), respects the flag gate, and dies
// when the account is disabled or deleted. Seeds org + admin + flag directly.

const ORG = "sa-test-org";
const ADMIN = "sa-test-admin";
const ADMIN_BUILTIN_ID = "role_admin_builtin";
const FLAG = "public-api.service-accounts";

const createCaller = t.createCallerFactory(apiKeysRouter);
const admin = () =>
  createCaller({ userId: ADMIN, activeOrganizationId: ORG, requestId: "sa-test" });

async function cleanup() {
  const db = getDb();
  await db.apiKey.deleteMany({ where: { organizationId: ORG } });
  await db.user.deleteMany({ where: { kind: "SERVICE", createdBy: ADMIN } });
  await db.roleAssignment.deleteMany({ where: { userId: ADMIN } });
  await db.organizationMembership.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: ADMIN } });
}

beforeAll(async () => {
  const db = getDb();
  await cleanup();

  registerApiKeysPermissions();
  // Register + enable the v2 flag (normally owned by @monark/public-api ;
  // registered here by key so this package's test needn't depend on it).
  registerFlags("public-api", {
    "service-accounts": { description: "test", defaultOn: false },
  });

  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  await db.user.create({ data: { id: ADMIN, email: `${ADMIN}@test.local` } });
  await db.organizationMembership.create({ data: { userId: ADMIN, organizationId: ORG } });
  await assignRole({
    userId: ADMIN,
    roleId: ADMIN_BUILTIN_ID,
    organizationId: ORG,
    grantedById: null,
  });
  await syncFlagsToDatabase();
  await setOverride(FLAG, {}, true, ADMIN);
});

afterAll(cleanup);

describe("service accounts", () => {
  it("provisions a machine User (kind SERVICE, svc_ id, reserved email) + membership", async () => {
    const account = await admin().serviceAccounts.create({ name: "CI Bot", roleIds: [] });
    expect(account.id.startsWith("svc_")).toBe(true);

    const row = await getDb().user.findUnique({ where: { id: account.id } });
    expect(row?.kind).toBe("SERVICE");
    expect(row?.displayName).toBe("CI Bot");
    expect(row?.email.endsWith("@service.invalid")).toBe(true);
    expect(row?.createdBy).toBe(ADMIN);

    const membership = await getDb().organizationMembership.findFirst({
      where: { userId: account.id, organizationId: ORG },
    });
    expect(membership).not.toBeNull();
  });

  it("lists the org's service accounts", async () => {
    const account = await admin().serviceAccounts.create({ name: "Lister", roleIds: [] });
    const list = await admin().serviceAccounts.list();
    expect(list.some((s) => s.id === account.id && s.name === "Lister")).toBe(true);
  });

  it("mints a key that authenticates AS the service account", async () => {
    const account = await admin().serviceAccounts.create({ name: "Keyed", roleIds: [] });
    const key = await admin().serviceAccounts.keys.create({
      serviceAccountId: account.id,
      name: "primary",
    });
    expect(key.plaintext.startsWith("mrk_")).toBe(true);

    const principal = await authenticateApiKey(key.plaintext);
    // The key acts as the MACHINE principal, not the admin who created it.
    expect(principal?.userId).toBe(account.id);
    expect(principal?.organizationId).toBe(ORG);
  });

  it("kills the account's keys when the account is disabled", async () => {
    const account = await admin().serviceAccounts.create({ name: "ToDisable", roleIds: [] });
    const key = await admin().serviceAccounts.keys.create({
      serviceAccountId: account.id,
      name: "k",
    });
    expect(await authenticateApiKey(key.plaintext)).not.toBeNull();

    await admin().serviceAccounts.disable({ id: account.id });
    // Owner is disabled → the key no longer authenticates (no row-level revoke).
    expect(await authenticateApiKey(key.plaintext)).toBeNull();
  });

  it("cascades key deletion when the account is deleted", async () => {
    const account = await admin().serviceAccounts.create({ name: "ToDelete", roleIds: [] });
    const key = await admin().serviceAccounts.keys.create({
      serviceAccountId: account.id,
      name: "k",
    });
    await admin().serviceAccounts.delete({ id: account.id });

    expect(await authenticateApiKey(key.plaintext)).toBeNull();
    const remaining = await getDb().apiKey.findMany({ where: { ownerUserId: account.id } });
    expect(remaining).toHaveLength(0);
  });

  it("mints a key with an expiry and refuses to mint for a disabled account", async () => {
    const account = await admin().serviceAccounts.create({ name: "Expiring", roleIds: [] });
    const key = await admin().serviceAccounts.keys.create({
      serviceAccountId: account.id,
      name: "exp",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    const stored = await getDb().apiKey.findUniqueOrThrow({ where: { id: key.id } });
    expect(stored.expiresAt?.toISOString()).toBe("2099-01-01T00:00:00.000Z");

    await admin().serviceAccounts.disable({ id: account.id });
    await expect(
      admin().serviceAccounts.keys.create({
        serviceAccountId: account.id,
        name: "nope",
      }),
    ).rejects.toThrow(/disabled/i);
  });

  it("revokes a service-account key (idempotently) and 404s on a missing key", async () => {
    const account = await admin().serviceAccounts.create({ name: "RevokeSA", roleIds: [] });
    const key = await admin().serviceAccounts.keys.create({
      serviceAccountId: account.id,
      name: "k",
    });
    expect(await authenticateApiKey(key.plaintext)).not.toBeNull();

    await admin().serviceAccounts.keys.revoke({ serviceAccountId: account.id, keyId: key.id });
    expect(await authenticateApiKey(key.plaintext)).toBeNull();
    // A second revoke is a no-op (already revoked) but still resolves.
    const again = await admin().serviceAccounts.keys.revoke({
      serviceAccountId: account.id,
      keyId: key.id,
    });
    expect(again.id).toBe(key.id);

    await expect(
      admin().serviceAccounts.keys.revoke({ serviceAccountId: account.id, keyId: "missing" }),
    ).rejects.toThrow(/not found/i);
  });

  it("is gated by the public-api.service-accounts flag", async () => {
    await setOverride(FLAG, {}, false, ADMIN);
    try {
      await expect(admin().serviceAccounts.create({ name: "Nope", roleIds: [] })).rejects.toThrow();
      await expect(admin().serviceAccounts.list()).rejects.toThrow();
    } finally {
      await setOverride(FLAG, {}, true, ADMIN);
    }
  });
});

// The v1 personal-key router (a key that acts AS its human creator), which the
// service-account suite above doesn't touch. No flag gate here — personal keys
// predate the v2 flag. Reuses the same ADMIN caller (ADMIN short-circuits the
// `api-keys.manage` permission these procedures require).
describe("personal keys (v1)", () => {
  it("creates a caller-owned key, lists it, and revokes it", async () => {
    const created = await admin().create({ name: "mine" });
    expect(created.plaintext.startsWith("mrk_")).toBe(true);

    const list = await admin().list();
    expect(list.some((k) => k.id === created.id && k.name === "mine")).toBe(true);
    // v1 : the key authenticates AS its creator, not a machine principal.
    const principal = await authenticateApiKey(created.plaintext);
    expect(principal?.userId).toBe(ADMIN);

    await admin().revoke({ id: created.id });
    expect(await authenticateApiKey(created.plaintext)).toBeNull();
  });

  it("accepts an expiry, revokes idempotently, and 404s on a missing key", async () => {
    const created = await admin().create({
      name: "exp",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    await admin().revoke({ id: created.id });
    const again = await admin().revoke({ id: created.id }); // already revoked → no-op
    expect(again.id).toBe(created.id);
    await expect(admin().revoke({ id: "missing" })).rejects.toThrow(/not found/i);
  });

  it("rejects unauthed callers on every procedure", async () => {
    const anon = createCaller({ userId: undefined, activeOrganizationId: ORG, requestId: "anon" });
    await expect(anon.list()).rejects.toThrow();
    await expect(anon.create({ name: "x" })).rejects.toThrow();
    await expect(anon.revoke({ id: "x" })).rejects.toThrow();
  });

  it("mints a limited key that stores its permission ceiling", async () => {
    const created = await admin().create({
      name: "limited",
      fullAccess: false,
      permissions: ["data-models.record-read"],
    });
    const principal = await authenticateApiKey(created.plaintext);
    expect(principal?.fullAccess).toBe(false);
    expect(principal?.permissions).toEqual(["data-models.record-read"]);
    // A full-access key (the default) carries no ceiling.
    const full = await admin().create({ name: "full" });
    expect((await authenticateApiKey(full.plaintext))?.fullAccess).toBe(true);
  });

  it("rejects a limited key with no permissions selected", async () => {
    await expect(
      admin().create({ name: "empty-limited", fullAccess: false, permissions: [] }),
    ).rejects.toThrow();
  });
});
