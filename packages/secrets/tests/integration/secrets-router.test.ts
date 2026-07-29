import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { on } from "@monark/common";
import type { DomainEvent } from "@monark/common/contracts/events";
import { t } from "@monark/common/trpc";
import { assignRole, createRole } from "@monark/rbac/server";
import { truncate } from "@monark/test-utils/db";
import { secretsRouter } from "../../src/server/index";
import { registerSecretsPermissions } from "../../src/server/permissions";

// The access-control + write-only boundary the /admin/secrets screen drives,
// exercised through the REAL tRPC procedures as scoped (non-admin) callers.
// `adminList` needs `secrets.read` ; `adminSet` / `adminDelete` need
// `secrets.manage` ; ADMIN short-circuits both. These specs prove: the DENY
// paths, that the plaintext value never crosses the wire (neither in a list nor
// in an emitted event), and the set → list → delete round-trip. A regression
// here is a secret leak or a privilege escalation.

const ORG = "secrets-authz-org";
const ORG_OTHER = "secrets-authz-org-b";
const U_ADMIN = "secrets-authz-admin"; // built-in ADMIN (short-circuits every permission)
const U_READER = "secrets-authz-reader"; // custom role : secrets.read only
const U_MANAGER = "secrets-authz-manager"; // custom role : secrets.manage only
const U_NONE = "secrets-authz-none"; // org member, no role
const ADMIN_BUILTIN_ID = "role_admin_builtin"; // migration-seeded built-in ADMIN row
const ALL_USERS = [U_ADMIN, U_READER, U_MANAGER, U_NONE];

const createCaller = t.createCallerFactory(secretsRouter);
const callerFor = (userId: string, orgId: string | null) =>
  createCaller({ userId, activeOrganizationId: orgId, requestId: "secrets-authz" });

// Captured secrets.* domain events, cleared per test.
const captured: DomainEvent[] = [];

beforeAll(async () => {
  const db = getDb();
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  await db.organization.deleteMany({ where: { id: { in: [ORG, ORG_OTHER] } } });
  await db.user.deleteMany({ where: { id: { in: ALL_USERS } } });

  registerSecretsPermissions(); // so createRole accepts secrets.read / secrets.manage

  for (const id of [ORG, ORG_OTHER]) {
    await db.organization.create({ data: { id, slug: id, displayName: id } });
  }
  for (const id of ALL_USERS) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    // Members of ORG only — so a cross-org call rejects at `requireOrg`, and a
    // denied same-org call exercises the permission check we care about.
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }
  await assignRole({
    userId: U_ADMIN,
    roleId: ADMIN_BUILTIN_ID,
    organizationId: ORG,
    grantedById: null,
  });

  const readerRole = await createRole({
    organizationId: ORG,
    key: "secrets-reader",
    name: "Secrets Reader",
    permissions: ["secrets.read"],
    createdById: U_ADMIN,
  });
  await assignRole({
    userId: U_READER,
    roleId: readerRole.id,
    organizationId: ORG,
    grantedById: null,
  });

  const managerRole = await createRole({
    organizationId: ORG,
    key: "secrets-manager",
    name: "Secrets Manager",
    permissions: ["secrets.manage"],
    createdById: U_ADMIN,
  });
  await assignRole({
    userId: U_MANAGER,
    roleId: managerRole.id,
    organizationId: ORG,
    grantedById: null,
  });

  on<DomainEvent>("secrets.created", (e) => void captured.push(e));
  on<DomainEvent>("secrets.updated", (e) => void captured.push(e));
  on<DomainEvent>("secrets.deleted", (e) => void captured.push(e));
});

afterEach(async () => {
  await truncate(getDb(), ["Secret"]);
  captured.length = 0;
});

afterAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: { in: [ORG, ORG_OTHER] } } });
  await db.user.deleteMany({ where: { id: { in: ALL_USERS } } });
});

describe("secrets router — authorization", () => {
  it("denies adminList without secrets.read (read ≠ manage)", async () => {
    await expect(callerFor(U_NONE, ORG).adminList()).rejects.toThrow();
    // A manager has `manage` but not `read` — still denied the list.
    await expect(callerFor(U_MANAGER, ORG).adminList()).rejects.toThrow();
  });

  it("denies adminSet / adminDelete without secrets.manage (manage ≠ read)", async () => {
    await expect(callerFor(U_READER, ORG).adminSet({ key: "X", value: "v" })).rejects.toThrow();
    await expect(callerFor(U_NONE, ORG).adminSet({ key: "X", value: "v" })).rejects.toThrow();
    await expect(callerFor(U_READER, ORG).adminDelete({ key: "X" })).rejects.toThrow();
  });

  it("rejects managing another org's secrets (caller is not a member)", async () => {
    await expect(
      callerFor(U_MANAGER, ORG_OTHER).adminSet({ key: "X", value: "v" }),
    ).rejects.toThrow();
  });
});

describe("secrets router — write-only surface", () => {
  it("manager sets ; reader lists names + metadata but never the value/ciphertext", async () => {
    const value = "ghp_super_secret_123";
    const setRes = await callerFor(U_MANAGER, ORG).adminSet({
      key: "GITHUB_TOKEN",
      value,
      description: "CI token",
    });
    expect(setRes).toEqual({ key: "GITHUB_TOKEN", created: true });

    const list = await callerFor(U_READER, ORG).adminList();
    expect(list).toHaveLength(1);
    const item = list[0];
    expect(item?.key).toBe("GITHUB_TOKEN");
    expect(item?.description).toBe("CI token");
    // The plaintext / ciphertext never crosses the wire.
    expect(JSON.stringify(list)).not.toContain(value);
    const shape = Object.keys(item ?? {});
    expect(shape).not.toContain("valueCipher");
    expect(shape).not.toContain("valueIv");
    expect(shape).not.toContain("valueTag");
  });

  it("emits secrets.created / updated / deleted with the key + org, never the value", async () => {
    const manager = callerFor(U_MANAGER, ORG);
    await manager.adminSet({ key: "TOKEN", value: "s3cr3t-plaintext" });
    await manager.adminSet({ key: "TOKEN", value: "rotated-value" }); // update in place
    await manager.adminDelete({ key: "TOKEN" });

    expect(captured.map((e) => e.type)).toEqual([
      "secrets.created",
      "secrets.updated",
      "secrets.deleted",
    ]);
    for (const e of captured) {
      expect((e as { key?: string }).key).toBe("TOKEN");
      expect((e as { organizationId?: string }).organizationId).toBe(ORG);
      const json = JSON.stringify(e);
      expect(json).not.toContain("s3cr3t-plaintext");
      expect(json).not.toContain("rotated-value");
    }
  });
});

describe("secrets router — round-trip", () => {
  it("sets, lists, and deletes through the caller (and reports a no-op delete)", async () => {
    const manager = callerFor(U_MANAGER, ORG);
    const admin = callerFor(U_ADMIN, ORG); // ADMIN short-circuits secrets.read

    await manager.adminSet({ key: "A", value: "1" });
    await manager.adminSet({ key: "B", value: "2", description: "second" });
    expect((await admin.adminList()).map((s) => s.key).sort()).toEqual(["A", "B"]);

    expect(await manager.adminDelete({ key: "A" })).toEqual({ key: "A", deleted: true });
    expect((await admin.adminList()).map((s) => s.key)).toEqual(["B"]);

    // Deleting a missing key reports deleted:false and emits nothing.
    captured.length = 0;
    expect(await manager.adminDelete({ key: "NOPE" })).toEqual({ key: "NOPE", deleted: false });
    expect(captured).toHaveLength(0);
  });
});
