import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { ValidationError } from "@monark/common";
import {
  deleteUserMetadataForModule,
  deleteUserMetadataValue,
  getUserMetadataValue,
  listUserMetadataForModule,
  setUserMetadataValue,
} from "../../src/server/metadata";

// Integration tests for the user-metadata API. The pure regex-based
// `assertModule` / `assertKey` validation is the same logic surfacing
// at every entry point ; covering it once via `setUserMetadataValue`
// is enough — listing the same regex 5x doesn't add signal. The DB
// path matters more : the `(userId, module, key)` compound unique +
// the upsert-vs-create branch + the `deleteMany` module-wide path
// each have their own potential for breaking under refactors.

const USER_A = "u-meta-a";
const USER_B = "u-meta-b";

beforeEach(async () => {
  const db = getDb();
  for (const id of [USER_A, USER_B]) {
    await db.user.upsert({
      where: { id },
      create: { id, email: `${id}@x.test`, displayName: id },
      update: {},
    });
  }
});

afterEach(async () => {
  // CASCADE clears UserMetadata via the FK on userId.
  await getDb().user.deleteMany({});
});

describe("users/metadata setUserMetadataValue", () => {
  it("creates a new row when none exists", async () => {
    const row = await setUserMetadataValue({
      userId: USER_A,
      module: "billing",
      key: "stripe-customer-id",
      value: "cus_123",
    });
    expect(row.userId).toBe(USER_A);
    expect(row.module).toBe("billing");
    expect(row.key).toBe("stripe-customer-id");
    expect(row.value).toBe("cus_123");
  });

  it("updates the existing row when (userId, module, key) already exists", async () => {
    await setUserMetadataValue({
      userId: USER_A,
      module: "billing",
      key: "stripe-customer-id",
      value: "cus_old",
    });
    const updated = await setUserMetadataValue({
      userId: USER_A,
      module: "billing",
      key: "stripe-customer-id",
      value: "cus_new",
    });
    expect(updated.value).toBe("cus_new");
    const all = await listUserMetadataForModule(USER_A, "billing");
    expect(all).toHaveLength(1);
  });

  it("stores arbitrary JSON-shaped values (object, array, number)", async () => {
    await setUserMetadataValue({
      userId: USER_A,
      module: "preferences",
      key: "feature-shape",
      value: { nested: { count: 7, names: ["a", "b"] }, opts: [1, 2, 3] },
    });
    const value = (await getUserMetadataValue(USER_A, "preferences", "feature-shape")) as {
      nested: { count: number; names: string[] };
      opts: number[];
    };
    expect(value.nested.count).toBe(7);
    expect(value.nested.names).toEqual(["a", "b"]);
    expect(value.opts).toEqual([1, 2, 3]);
  });
});

describe("users/metadata getUserMetadataValue", () => {
  it("returns undefined for a missing (userId, module, key) tuple", async () => {
    const value = await getUserMetadataValue(USER_A, "billing", "nope");
    expect(value).toBeUndefined();
  });

  it("returns the stored value for a real row", async () => {
    await setUserMetadataValue({
      userId: USER_A,
      module: "billing",
      key: "k",
      value: 42,
    });
    expect(await getUserMetadataValue(USER_A, "billing", "k")).toBe(42);
  });

  it("does NOT leak across users (same module + key, different user)", async () => {
    await setUserMetadataValue({
      userId: USER_A,
      module: "billing",
      key: "k",
      value: "for-A",
    });
    expect(await getUserMetadataValue(USER_B, "billing", "k")).toBeUndefined();
  });
});

describe("users/metadata listUserMetadataForModule", () => {
  it("returns every row for one user × one module, sorted by key", async () => {
    for (const key of ["b-key", "a-key", "c-key"]) {
      await setUserMetadataValue({
        userId: USER_A,
        module: "billing",
        key,
        value: `v-${key}`,
      });
    }
    const rows = await listUserMetadataForModule(USER_A, "billing");
    expect(rows.map((r) => r.key)).toEqual(["a-key", "b-key", "c-key"]);
  });

  it("excludes rows from other modules", async () => {
    await setUserMetadataValue({
      userId: USER_A,
      module: "billing",
      key: "k",
      value: "billing-v",
    });
    await setUserMetadataValue({
      userId: USER_A,
      module: "preferences",
      key: "k",
      value: "prefs-v",
    });
    const rows = await listUserMetadataForModule(USER_A, "billing");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("billing-v");
  });

  it("returns empty when the user has no metadata for the module", async () => {
    const rows = await listUserMetadataForModule(USER_A, "billing");
    expect(rows).toEqual([]);
  });
});

describe("users/metadata deleteUserMetadataValue", () => {
  it("removes the row by (userId, module, key)", async () => {
    await setUserMetadataValue({
      userId: USER_A,
      module: "billing",
      key: "k",
      value: 1,
    });
    await deleteUserMetadataValue(USER_A, "billing", "k");
    expect(await getUserMetadataValue(USER_A, "billing", "k")).toBeUndefined();
  });

  it("is idempotent — deleting a missing row does not throw", async () => {
    await expect(deleteUserMetadataValue(USER_A, "billing", "never-set")).resolves.toBeUndefined();
  });
});

describe("users/metadata deleteUserMetadataForModule", () => {
  it("removes every row for one user × one module + reports the count", async () => {
    for (const key of ["a", "b", "c"]) {
      await setUserMetadataValue({
        userId: USER_A,
        module: "billing",
        key,
        value: 1,
      });
    }
    const result = await deleteUserMetadataForModule(USER_A, "billing");
    expect(result.count).toBe(3);
    const rows = await listUserMetadataForModule(USER_A, "billing");
    expect(rows).toEqual([]);
  });

  it("does not touch rows in other modules for the same user", async () => {
    await setUserMetadataValue({
      userId: USER_A,
      module: "billing",
      key: "k",
      value: 1,
    });
    await setUserMetadataValue({
      userId: USER_A,
      module: "preferences",
      key: "k",
      value: 2,
    });
    await deleteUserMetadataForModule(USER_A, "billing");
    const prefs = await listUserMetadataForModule(USER_A, "preferences");
    expect(prefs).toHaveLength(1);
  });

  it("does not touch rows for other users", async () => {
    await setUserMetadataValue({
      userId: USER_A,
      module: "billing",
      key: "k",
      value: 1,
    });
    await setUserMetadataValue({
      userId: USER_B,
      module: "billing",
      key: "k",
      value: 2,
    });
    await deleteUserMetadataForModule(USER_A, "billing");
    const bRows = await listUserMetadataForModule(USER_B, "billing");
    expect(bRows).toHaveLength(1);
  });
});

describe("users/metadata input validation", () => {
  it("rejects an invalid module name with ValidationError", async () => {
    await expect(
      setUserMetadataValue({
        userId: USER_A,
        module: "BAD-MODULE",
        key: "k",
        value: 1,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an empty key with ValidationError", async () => {
    await expect(
      setUserMetadataValue({
        userId: USER_A,
        module: "billing",
        key: "",
        value: 1,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a key that exceeds 200 chars with ValidationError", async () => {
    const tooLong = "a".repeat(201);
    await expect(
      setUserMetadataValue({
        userId: USER_A,
        module: "billing",
        key: tooLong,
        value: 1,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a key that doesn't match the [a-z][a-z0-9_.-]* pattern", async () => {
    await expect(
      setUserMetadataValue({
        userId: USER_A,
        module: "billing",
        key: "Bad-Key",
        value: 1,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("validates module on the read paths too (listUserMetadataForModule)", async () => {
    await expect(listUserMetadataForModule(USER_A, "BAD")).rejects.toThrow(ValidationError);
  });

  it("validates module + key on getUserMetadataValue", async () => {
    await expect(getUserMetadataValue(USER_A, "BAD", "k")).rejects.toThrow(ValidationError);
  });
});
