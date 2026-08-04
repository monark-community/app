import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { ValidationError } from "@monark/common";
import { truncate } from "@monark/test-utils/db";
import {
  deleteOrganizationMetadataForModule,
  deleteOrganizationMetadataValue,
  getOrganizationMetadataValue,
  listOrganizationMetadataForModule,
  setOrganizationMetadataValue,
} from "../../src/server/metadata";

// The per-org key/value metadata sidecar (a module attaches org-scoped config
// without touching core columns). CRUD + the module/key validation gates +
// JSON value round-trips against a real Postgres.

const ORG = "org-meta";
const ORG_OTHER = "org-meta-b";
const MOD = "billing";

beforeAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: { in: [ORG, ORG_OTHER] } } });
  for (const id of [ORG, ORG_OTHER]) {
    await db.organization.create({ data: { id, slug: id, displayName: id } });
  }
});

afterEach(async () => {
  await truncate(getDb(), ["OrganizationMetadata"]);
});

afterAll(async () => {
  await getDb().organization.deleteMany({ where: { id: { in: [ORG, ORG_OTHER] } } });
});

describe("organizations/metadata CRUD", () => {
  it("set → get round-trips, and a second set updates in place", async () => {
    await setOrganizationMetadataValue({
      organizationId: ORG,
      module: MOD,
      key: "plan",
      value: "pro",
    });
    expect(await getOrganizationMetadataValue(ORG, MOD, "plan")).toBe("pro");

    await setOrganizationMetadataValue({
      organizationId: ORG,
      module: MOD,
      key: "plan",
      value: "enterprise",
    });
    expect(await getOrganizationMetadataValue(ORG, MOD, "plan")).toBe("enterprise");
    expect(await listOrganizationMetadataForModule(ORG, MOD)).toHaveLength(1);
  });

  it("round-trips JSON value shapes", async () => {
    const shapes: Array<[string, unknown]> = [
      ["obj", { a: 1, nested: { b: true } }],
      ["arr", [1, "two", false]],
      ["num", 42],
      ["bool", true],
      ["nul", null],
    ];
    for (const [key, value] of shapes) {
      await setOrganizationMetadataValue({ organizationId: ORG, module: MOD, key, value });
    }
    for (const [key, value] of shapes) {
      expect(await getOrganizationMetadataValue(ORG, MOD, key)).toEqual(value);
    }
  });

  it("lists a module's rows ordered by key, scoped to the org + module", async () => {
    await setOrganizationMetadataValue({ organizationId: ORG, module: MOD, key: "zeta", value: 1 });
    await setOrganizationMetadataValue({
      organizationId: ORG,
      module: MOD,
      key: "alpha",
      value: 2,
    });
    await setOrganizationMetadataValue({
      organizationId: ORG,
      module: "other",
      key: "alpha",
      value: 3,
    });
    await setOrganizationMetadataValue({
      organizationId: ORG_OTHER,
      module: MOD,
      key: "alpha",
      value: 4,
    });

    const rows = await listOrganizationMetadataForModule(ORG, MOD);
    expect(rows.map((r) => r.key)).toEqual(["alpha", "zeta"]); // key-sorted, other module/org excluded
  });

  it("get returns undefined for a missing key ; delete of a missing key is a no-op", async () => {
    expect(await getOrganizationMetadataValue(ORG, MOD, "nope")).toBeUndefined();
    await expect(deleteOrganizationMetadataValue(ORG, MOD, "nope")).resolves.toBeUndefined();
  });

  it("deletes a single value", async () => {
    await setOrganizationMetadataValue({
      organizationId: ORG,
      module: MOD,
      key: "temp",
      value: "x",
    });
    await deleteOrganizationMetadataValue(ORG, MOD, "temp");
    expect(await getOrganizationMetadataValue(ORG, MOD, "temp")).toBeUndefined();
  });

  it("deletes a whole module's metadata and reports the count, leaving other modules", async () => {
    await setOrganizationMetadataValue({ organizationId: ORG, module: MOD, key: "a", value: 1 });
    await setOrganizationMetadataValue({ organizationId: ORG, module: MOD, key: "b", value: 2 });
    await setOrganizationMetadataValue({ organizationId: ORG, module: "keep", key: "a", value: 3 });

    const res = await deleteOrganizationMetadataForModule(ORG, MOD);
    expect(res.count).toBe(2);
    expect(await listOrganizationMetadataForModule(ORG, MOD)).toHaveLength(0);
    expect(await listOrganizationMetadataForModule(ORG, "keep")).toHaveLength(1);
  });
});

describe("organizations/metadata validation", () => {
  it("rejects invalid module names", async () => {
    await expect(getOrganizationMetadataValue(ORG, "Billing", "k")).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      setOrganizationMetadataValue({ organizationId: ORG, module: "1bad", key: "k", value: 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(listOrganizationMetadataForModule(ORG, "bad module")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects invalid keys (empty, too long, bad chars)", async () => {
    await expect(
      setOrganizationMetadataValue({ organizationId: ORG, module: MOD, key: "", value: 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      setOrganizationMetadataValue({
        organizationId: ORG,
        module: MOD,
        key: "A".repeat(201),
        value: 1,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(getOrganizationMetadataValue(ORG, MOD, "Bad Key")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
