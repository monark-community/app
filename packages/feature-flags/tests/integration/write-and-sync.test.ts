import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import { ValidationError, on } from "@monark/common";
import { _resetHandlersForTesting } from "@monark/common/events";
import {
  _resetFlagRegistryForTesting,
  registerFlags,
  type FlagFlippedEvent,
} from "../../src/contracts/index";
import { setOverride, removeOverride, listFlagDefinitions } from "../../src/server/write";
import { syncFlagsToDatabase } from "../../src/server/sync";
import {
  readOverridesForFlag,
  writeOverride,
  upsertFlagDefinition,
  deleteOverride,
} from "../../src/server/data";

// Integration tests for the feature-flag write + sync paths against
// the Postgres testcontainer. The pure scope/registry validation is
// straightforward unit logic, but the upsert-by-composite-scope path
// in `writeOverride` and the registry-driven fan-out in
// `syncFlagsToDatabase` need a real DB to verify : the find-by-scope
// `WHERE` clause (with three nullable columns) is the kind of code
// that can pass typecheck and a single happy-path mock and still
// match the wrong rows in production.
//
// `is-enabled.test.ts` covers the read path ; this file covers
// everything that mutates state.

const ORG_A = "ff-w-org-a";
const ORG_B = "ff-w-org-b";
const USER_A = "ff-w-user-a";
const USER_B = "ff-w-user-b";
const ROLE_A = "ff-w-role-a";
const ACTOR = "ff-w-actor";

beforeAll(async () => {
  const db = getDb();
  for (const id of [ORG_A, ORG_B]) {
    await db.organization.upsert({
      where: { id },
      create: { id, slug: id, displayName: id },
      update: {},
    });
  }
  for (const id of [USER_A, USER_B, ACTOR]) {
    await db.user.upsert({
      where: { id },
      create: { id, email: `${id}@test.local` },
      update: {},
    });
  }
  // Custom Role row at platform tier so the role-scoped override
  // tests have something to point at without depending on the rbac
  // built-in seeding pattern. `findFirst + create` because Prisma
  // rejects null in compound-unique `where` (see rbac integration
  // tests for the same workaround).
  const existingRole = await db.role.findFirst({
    where: { id: ROLE_A },
    select: { id: true },
  });
  if (!existingRole) {
    await db.role.create({
      data: {
        id: ROLE_A,
        key: "ff-test-role",
        name: "Feature-flag test role",
        builtIn: false,
        organizationId: null,
      },
    });
  }
});

beforeEach(() => {
  _resetFlagRegistryForTesting();
  _resetHandlersForTesting();
  registerFlags("test", {
    "alpha-flag": {
      description: "alpha test flag",
      defaultOn: false,
    },
    "beta-flag": {
      description: "beta test flag",
      defaultOn: true,
    },
  });
});

afterEach(async () => {
  // Truncate the override + flag tables so each spec starts from a
  // known empty state. `Role` is intentionally excluded — the
  // `ff-w-role-a` row from `beforeAll` is referenced by every
  // role-scoped override spec.
  await truncate(getDb(), ["FeatureFlagOverride", "FeatureFlag"]);
});

function captureEvents(): Array<{ type: string; payload: unknown }> {
  const events: Array<{ type: string; payload: unknown }> = [];
  on("*", (event) => {
    // The event bus delivers the raw event object ; the module /
    // flagKey / scope etc. live at the event's top level, not under
    // a nested `payload` key. Mirror the rbac integration test's
    // capture pattern so reads stay consistent.
    events.push({ type: event.type, payload: event });
  });
  return events;
}

async function seedFlagDefinitions(): Promise<void> {
  for (const key of ["alpha-flag", "beta-flag"]) {
    await upsertFlagDefinition("test", key, `seeded ${key}`, key === "beta-flag");
  }
}

describe("feature-flags/sync syncFlagsToDatabase", () => {
  it("upserts every registered flag into the FeatureFlag table", async () => {
    await syncFlagsToDatabase();
    const db = getDb();
    const rows = await db.featureFlag.findMany({
      where: { module: "test" },
      orderBy: { key: "asc" },
    });
    expect(rows.map((r) => r.key)).toEqual(["alpha-flag", "beta-flag"]);
    const alpha = rows.find((r) => r.key === "alpha-flag");
    const beta = rows.find((r) => r.key === "beta-flag");
    expect(alpha?.defaultOn).toBe(false);
    expect(alpha?.description).toBe("alpha test flag");
    expect(beta?.defaultOn).toBe(true);
    expect(beta?.description).toBe("beta test flag");
  });

  it("is idempotent — running twice produces the same rows, no duplicates", async () => {
    await syncFlagsToDatabase();
    await syncFlagsToDatabase();
    const db = getDb();
    const count = await db.featureFlag.count({ where: { module: "test" } });
    expect(count).toBe(2);
  });

  it("updates description + defaultOn when the registry changes", async () => {
    await syncFlagsToDatabase();
    _resetFlagRegistryForTesting();
    registerFlags("test", {
      "alpha-flag": {
        description: "alpha — REVISED",
        defaultOn: true,
      },
      "beta-flag": {
        description: "beta test flag",
        defaultOn: true,
      },
    });
    await syncFlagsToDatabase();
    const db = getDb();
    const alpha = await db.featureFlag.findUnique({
      where: { module_key: { module: "test", key: "alpha-flag" } },
    });
    expect(alpha?.description).toBe("alpha — REVISED");
    expect(alpha?.defaultOn).toBe(true);
  });

  it("does NOT remove a flag definition that's been dropped from the registry (additive sync)", async () => {
    await syncFlagsToDatabase();
    _resetFlagRegistryForTesting();
    registerFlags("test", {
      "alpha-flag": {
        description: "alpha test flag",
        defaultOn: false,
      },
    });
    await syncFlagsToDatabase();
    const db = getDb();
    const beta = await db.featureFlag.findUnique({
      where: { module_key: { module: "test", key: "beta-flag" } },
    });
    expect(beta).not.toBeNull();
  });
});

describe("feature-flags/write setOverride — happy path + idempotency", () => {
  it("creates a new override row at global scope", async () => {
    await seedFlagDefinitions();
    await setOverride("test.alpha-flag", {}, true, ACTOR, "first flip");
    const rows = await readOverridesForFlag({
      module: "test",
      flagKey: "alpha-flag",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.enabled).toBe(true);
    expect(rows[0]?.note).toBe("first flip");
    expect(rows[0]?.setById).toBe(ACTOR);
  });

  it("updates the existing row when the same scope is re-targeted (no duplicate row)", async () => {
    await seedFlagDefinitions();
    await setOverride("test.alpha-flag", { organizationId: ORG_A }, true, ACTOR, "first");
    await setOverride("test.alpha-flag", { organizationId: ORG_A }, false, ACTOR, "second");
    const rows = await readOverridesForFlag({
      module: "test",
      flagKey: "alpha-flag",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.enabled).toBe(false);
    expect(rows[0]?.note).toBe("second");
  });

  it("emits feature-flag.flipped with the full payload shape", async () => {
    await seedFlagDefinitions();
    const events = captureEvents();
    await setOverride("test.alpha-flag", { userId: USER_A }, true, ACTOR, "trial");
    const flipped = events.find((e) => e.type === "feature-flag.flipped") as
      | { type: string; payload: FlagFlippedEvent }
      | undefined;
    expect(flipped).toBeDefined();
    expect(flipped!.payload.module).toBe("test");
    expect(flipped!.payload.flagKey).toBe("alpha-flag");
    expect(flipped!.payload.scope).toEqual({ userId: USER_A });
    expect(flipped!.payload.enabled).toBe(true);
    expect(flipped!.payload.actorId).toBe(ACTOR);
    expect(flipped!.payload.occurredAt).toBeInstanceOf(Date);
  });
});

describe("feature-flags/write setOverride — validation", () => {
  it("rejects an unknown flag with ValidationError", async () => {
    await expect(setOverride("test.does-not-exist", {}, true, ACTOR)).rejects.toThrow(
      ValidationError,
    );
  });

  it("rejects a multi-target scope (org + user) with ValidationError", async () => {
    await seedFlagDefinitions();
    await expect(
      setOverride("test.alpha-flag", { organizationId: ORG_A, userId: USER_A }, true, ACTOR),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a missing actorId with ValidationError", async () => {
    await seedFlagDefinitions();
    await expect(setOverride("test.alpha-flag", {}, true, "")).rejects.toThrow(ValidationError);
  });
});

describe("feature-flags/write removeOverride", () => {
  it("deletes the override row by id", async () => {
    await seedFlagDefinitions();
    await setOverride("test.alpha-flag", { organizationId: ORG_A }, true, ACTOR);
    const rows = await readOverridesForFlag({
      module: "test",
      flagKey: "alpha-flag",
    });
    const targetId = rows[0]!.id;
    await removeOverride(targetId, ACTOR);
    const after = await readOverridesForFlag({
      module: "test",
      flagKey: "alpha-flag",
    });
    expect(after).toHaveLength(0);
  });

  it("rejects a missing actorId with ValidationError", async () => {
    await expect(removeOverride("any-id", "")).rejects.toThrow(ValidationError);
  });
});

describe("feature-flags/data writeOverride scope variants", () => {
  it("creates distinct rows for the same flag at different orgs", async () => {
    await seedFlagDefinitions();
    await writeOverride({
      module: "test",
      flagKey: "alpha-flag",
      scope: { organizationId: ORG_A },
      enabled: true,
      setById: ACTOR,
    });
    await writeOverride({
      module: "test",
      flagKey: "alpha-flag",
      scope: { organizationId: ORG_B },
      enabled: false,
      setById: ACTOR,
    });
    const rows = await readOverridesForFlag({
      module: "test",
      flagKey: "alpha-flag",
    });
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.organizationId === ORG_A);
    const b = rows.find((r) => r.organizationId === ORG_B);
    expect(a?.enabled).toBe(true);
    expect(b?.enabled).toBe(false);
  });

  it("creates distinct rows for the same flag at different users", async () => {
    await seedFlagDefinitions();
    await writeOverride({
      module: "test",
      flagKey: "alpha-flag",
      scope: { userId: USER_A },
      enabled: true,
      setById: ACTOR,
    });
    await writeOverride({
      module: "test",
      flagKey: "alpha-flag",
      scope: { userId: USER_B },
      enabled: false,
      setById: ACTOR,
    });
    const rows = await readOverridesForFlag({
      module: "test",
      flagKey: "alpha-flag",
    });
    expect(rows).toHaveLength(2);
  });

  it("creates a role-scoped row with non-null roleId", async () => {
    await seedFlagDefinitions();
    await writeOverride({
      module: "test",
      flagKey: "alpha-flag",
      scope: { roleId: ROLE_A },
      enabled: true,
      setById: ACTOR,
    });
    const rows = await readOverridesForFlag({
      module: "test",
      flagKey: "alpha-flag",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.roleId).toBe(ROLE_A);
    expect(rows[0]?.organizationId).toBeNull();
    expect(rows[0]?.userId).toBeNull();
  });
});

describe("feature-flags/data deleteOverride", () => {
  it("removes the row by id (no-op behaviour for unknown id is the caller's responsibility)", async () => {
    await seedFlagDefinitions();
    await writeOverride({
      module: "test",
      flagKey: "alpha-flag",
      scope: {},
      enabled: true,
      setById: ACTOR,
    });
    const [row] = await readOverridesForFlag({
      module: "test",
      flagKey: "alpha-flag",
    });
    await deleteOverride(row!.id);
    const after = await readOverridesForFlag({
      module: "test",
      flagKey: "alpha-flag",
    });
    expect(after).toHaveLength(0);
  });
});

describe("feature-flags/write listFlagDefinitions", () => {
  it("projects each registered descriptor into the dotted-key + module + description + defaultOn shape", () => {
    const list = listFlagDefinitions();
    const alpha = list.find((d) => d.key === "test.alpha-flag");
    const beta = list.find((d) => d.key === "test.beta-flag");
    expect(alpha?.module).toBe("test");
    expect(alpha?.defaultOn).toBe(false);
    expect(alpha?.description).toBe("alpha test flag");
    expect(beta?.defaultOn).toBe(true);
  });
});
