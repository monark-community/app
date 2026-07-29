import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import { deleteSecret, getSecretValue, listSecrets, setSecret } from "../../src/server/data";

// Exercises the org-secrets data layer against a real Postgres testcontainer:
// the encrypt-at-rest round-trip, per-org isolation, that the safe projection
// never leaks the value / ciphertext, `lastUsedAt` stamping, and delete.

const ORG_A = "secrets-org-a";
const ORG_B = "secrets-org-b";
const USER = "secrets-user";

beforeAll(async () => {
  // The data layer loads this lazily (fail-closed); set a valid 32-byte key.
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  for (const id of [ORG_A, ORG_B]) {
    await getDb().organization.upsert({
      where: { id },
      create: { id, slug: id, displayName: id },
      update: {},
    });
  }
});

afterEach(async () => {
  await truncate(getDb(), ["Secret"]);
});

afterAll(async () => {
  await getDb()
    .organization.delete({ where: { id: ORG_A } })
    .catch(() => {});
  await getDb()
    .organization.delete({ where: { id: ORG_B } })
    .catch(() => {});
});

describe("secrets data layer", () => {
  it("round-trips an encrypted value (create then read)", async () => {
    const { created } = await setSecret({
      organizationId: ORG_A,
      key: "GITHUB_TOKEN",
      value: "ghp_secret_value",
      createdBy: USER,
    });
    expect(created).toBe(true);
    expect(await getSecretValue(ORG_A, "GITHUB_TOKEN")).toBe("ghp_secret_value");
  });

  it("stores the ciphertext at rest, never the plaintext", async () => {
    await setSecret({
      organizationId: ORG_A,
      key: "API_KEY",
      value: "plaintext-123",
      createdBy: USER,
    });
    const row = await getDb().secret.findFirstOrThrow({
      where: { organizationId: ORG_A, key: "API_KEY" },
    });
    const stored = Buffer.from(row.valueCipher).toString("utf8");
    expect(stored).not.toContain("plaintext-123");
    // Distinct IV + tag columns are populated.
    expect(row.valueIv.length).toBe(12);
    expect(row.valueTag.length).toBe(16);
  });

  it("upserts on (org, key): a second set updates in place and flips created=false", async () => {
    await setSecret({ organizationId: ORG_A, key: "TOKEN", value: "v1", createdBy: USER });
    const second = await setSecret({
      organizationId: ORG_A,
      key: "TOKEN",
      value: "v2",
      createdBy: USER,
    });
    expect(second.created).toBe(false);
    expect(await getSecretValue(ORG_A, "TOKEN")).toBe("v2");
    expect(await listSecrets(ORG_A)).toHaveLength(1);
  });

  it("updates the description only, leaving the value untouched, when no value is passed", async () => {
    await setSecret({
      organizationId: ORG_A,
      key: "KEEP",
      value: "keep-me",
      description: "old",
      createdBy: USER,
    });
    const res = await setSecret({
      organizationId: ORG_A,
      key: "KEEP",
      description: "new note",
      createdBy: USER,
    });
    expect(res.created).toBe(false);
    // Value survives a description-only edit.
    expect(await getSecretValue(ORG_A, "KEEP")).toBe("keep-me");
    expect((await listSecrets(ORG_A))[0]?.description).toBe("new note");
  });

  it("rejects creating a secret without a value", async () => {
    await expect(
      setSecret({ organizationId: ORG_A, key: "NOVALUE", createdBy: USER }),
    ).rejects.toThrow(/value is required/i);
    expect(await listSecrets(ORG_A)).toHaveLength(0);
  });

  it("isolates secrets per org (org B cannot read org A's value)", async () => {
    await setSecret({
      organizationId: ORG_A,
      key: "SHARED_NAME",
      value: "a-value",
      createdBy: USER,
    });
    await setSecret({
      organizationId: ORG_B,
      key: "SHARED_NAME",
      value: "b-value",
      createdBy: USER,
    });
    expect(await getSecretValue(ORG_A, "SHARED_NAME")).toBe("a-value");
    expect(await getSecretValue(ORG_B, "SHARED_NAME")).toBe("b-value");
    // Reading a name that only exists in the other org returns null, not a leak.
    await deleteSecret(ORG_B, "SHARED_NAME");
    expect(await getSecretValue(ORG_B, "SHARED_NAME")).toBeNull();
    expect(await getSecretValue(ORG_A, "SHARED_NAME")).toBe("a-value");
  });

  it("listSecrets never returns the value or ciphertext", async () => {
    await setSecret({
      organizationId: ORG_A,
      key: "LISTED",
      value: "should-not-appear",
      description: "a note",
      createdBy: USER,
    });
    const [summary, ...rest] = await listSecrets(ORG_A);
    expect(rest).toHaveLength(0);
    expect(summary).toBeDefined();
    // The projected type has no value/cipher fields; assert on the serialized shape too.
    const keys = Object.keys(summary ?? {});
    expect(keys).not.toContain("valueCipher");
    expect(keys).not.toContain("valueIv");
    expect(keys).not.toContain("valueTag");
    expect(JSON.stringify(summary)).not.toContain("should-not-appear");
    expect(summary?.key).toBe("LISTED");
    expect(summary?.description).toBe("a note");
  });

  it("stamps lastUsedAt on read", async () => {
    await setSecret({ organizationId: ORG_A, key: "USED", value: "v", createdBy: USER });
    const before = (await listSecrets(ORG_A))[0];
    expect(before?.lastUsedAt).toBeNull();
    await getSecretValue(ORG_A, "USED");
    const after = (await listSecrets(ORG_A))[0];
    expect(after?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("returns null for a missing secret and reports delete outcome", async () => {
    expect(await getSecretValue(ORG_A, "NOPE")).toBeNull();
    expect(await deleteSecret(ORG_A, "NOPE")).toBe(false);
    await setSecret({ organizationId: ORG_A, key: "GONE", value: "v", createdBy: USER });
    expect(await deleteSecret(ORG_A, "GONE")).toBe(true);
    expect(await getSecretValue(ORG_A, "GONE")).toBeNull();
  });
});
