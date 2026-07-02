import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { NotFoundError } from "@monark/common";
import { getById, getByEmail, getByIdOrThrow, getCurrent } from "../../src/server/read";

// Integration tests for the read.ts wrappers. These are thin
// passthroughs over `data.ts` (`findById` / `findByEmail`) but the
// `getByIdOrThrow` NotFoundError path and `getCurrent`'s null-userId
// short-circuit are the kind of branches that production code
// branches on ; locking them in here makes the gate explicit.

afterEach(async () => {
  await getDb().user.deleteMany({});
});

async function seedUser(id: string, email: string): Promise<void> {
  await getDb().user.create({
    data: { id, email, displayName: id },
  });
}

describe("users/read getById", () => {
  it("returns null for an unknown id", async () => {
    expect(await getById("does-not-exist")).toBeNull();
  });

  it("returns the row for a real id", async () => {
    await seedUser("u-1", "u1@x.test");
    const row = await getById("u-1");
    expect(row?.id).toBe("u-1");
    expect(row?.email).toBe("u1@x.test");
  });
});

describe("users/read getByIdOrThrow", () => {
  it("throws NotFoundError for an unknown id", async () => {
    await expect(getByIdOrThrow("missing")).rejects.toThrow(NotFoundError);
  });

  it("returns the row for a real id", async () => {
    await seedUser("u-2", "u2@x.test");
    const row = await getByIdOrThrow("u-2");
    expect(row.id).toBe("u-2");
  });
});

describe("users/read getByEmail", () => {
  it("returns null for an unknown email", async () => {
    expect(await getByEmail("nobody@x.test")).toBeNull();
  });

  it("returns the row for a real email", async () => {
    await seedUser("u-3", "u3@x.test");
    const row = await getByEmail("u3@x.test");
    expect(row?.id).toBe("u-3");
  });
});

describe("users/read getCurrent", () => {
  it("returns null when userId is null (anonymous request)", async () => {
    await seedUser("u-4", "u4@x.test");
    expect(await getCurrent({ userId: null })).toBeNull();
  });

  it("returns the row for a real userId", async () => {
    await seedUser("u-5", "u5@x.test");
    const row = await getCurrent({ userId: "u-5" });
    expect(row?.id).toBe("u-5");
  });

  it("returns null when userId is set but the user doesn't exist", async () => {
    expect(await getCurrent({ userId: "ghost" })).toBeNull();
  });
});
