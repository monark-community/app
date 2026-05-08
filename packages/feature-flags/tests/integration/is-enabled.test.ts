import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { getDb } from "@monark/db"
import { truncate } from "@monark/test-utils/db"
import {
  _resetFlagRegistryForTesting,
  registerFlags,
} from "../../src/contracts/index"
import { getFlags, isEnabled } from "../../src/server/resolve"

// Integration tests for `isEnabled` + `getFlags` against the
// Postgres FeatureFlagOverride table. The pure precedence logic
// (`mostSpecific`) is unit-tested in `tests/resolve.test.ts` ; this
// suite locks in the data-layer contract — that the SQL `WHERE`
// shape returns exactly the rows the resolver expects, in the
// orientation it expects, and that the FK constraint on
// `(module, flagKey) → FeatureFlag(module, key)` cleans up
// override rows when a flag definition is removed.
//
// The runtime-loaded flag registry is reset + repopulated in
// `beforeEach` so the tests don't depend on the order Vitest picks
// for sibling files (a different package's `registerFlags` call
// could leak state into ours).

const ORG_A = "ff-org-a"
const ORG_B = "ff-org-b"
const USER_A = "ff-user-a"
const USER_B = "ff-user-b"

beforeAll(async () => {
  const db = getDb()
  for (const id of [ORG_A, ORG_B]) {
    await db.organization.upsert({
      where: { id },
      create: { id, slug: id, displayName: id },
      update: {},
    })
  }
  for (const id of [USER_A, USER_B]) {
    await db.user.upsert({
      where: { id },
      create: { id, email: `${id}@test.local` },
      update: {},
    })
  }
})

beforeEach(async () => {
  _resetFlagRegistryForTesting()
  registerFlags("test", {
    "off-by-default": {
      description: "off-by-default registry flag",
      defaultOn: false,
    },
    "on-by-default": {
      description: "on-by-default registry flag",
      defaultOn: true,
    },
    "another-flag": {
      description: "second flag for getFlags multi-key test",
      defaultOn: false,
    },
  })
  // Seed FeatureFlag definitions that match the registry so the
  // FK from FeatureFlagOverride resolves. These mirror what the
  // production `syncFlagsToDatabase` step does at api boot.
  const db = getDb()
  for (const key of ["off-by-default", "on-by-default", "another-flag"]) {
    await db.featureFlag.upsert({
      where: { module_key: { module: "test", key } },
      create: {
        module: "test",
        key,
        description: "seeded by integration test",
        defaultOn: key === "on-by-default",
      },
      update: {},
    })
  }
})

afterEach(async () => {
  await truncate(getDb(), ["FeatureFlagOverride", "FeatureFlag"])
})

async function setOverride(input: {
  flagKey: string
  enabled: boolean
  organizationId?: string | null
  userId?: string | null
  roleId?: string | null
}): Promise<void> {
  const db = getDb()
  await db.featureFlagOverride.create({
    data: {
      module: "test",
      flagKey: input.flagKey,
      enabled: input.enabled,
      organizationId: input.organizationId ?? null,
      userId: input.userId ?? null,
      roleId: input.roleId ?? null,
      setById: "system:test",
    },
  })
}

describe("feature-flags/resolve isEnabled — registry default fallback", () => {
  it("falls back to defaultOn=false when no override exists", async () => {
    expect(await isEnabled("test.off-by-default")).toBe(false)
  })

  it("falls back to defaultOn=true when no override exists", async () => {
    expect(await isEnabled("test.on-by-default")).toBe(true)
  })

  it("returns false for an unknown flag (no def, no override)", async () => {
    expect(await isEnabled("test.does-not-exist")).toBe(false)
  })
})

describe("feature-flags/resolve isEnabled — global override beats default", () => {
  it("global enable=true beats defaultOn=false", async () => {
    await setOverride({ flagKey: "off-by-default", enabled: true })
    expect(await isEnabled("test.off-by-default")).toBe(true)
  })

  it("global enable=false beats defaultOn=true", async () => {
    await setOverride({ flagKey: "on-by-default", enabled: false })
    expect(await isEnabled("test.on-by-default")).toBe(false)
  })
})

describe("feature-flags/resolve isEnabled — scoped precedence", () => {
  it("user-scoped override beats org-, role-, and global-scoped", async () => {
    await setOverride({ flagKey: "off-by-default", enabled: false }) // global
    await setOverride({
      flagKey: "off-by-default",
      enabled: false,
      organizationId: ORG_A,
    })
    await setOverride({
      flagKey: "off-by-default",
      enabled: true,
      userId: USER_A,
    })
    expect(
      await isEnabled("test.off-by-default", {
        userId: USER_A,
        organizationId: ORG_A,
      }),
    ).toBe(true)
  })

  it("org-scoped override beats global when no user override matches", async () => {
    await setOverride({ flagKey: "off-by-default", enabled: false }) // global
    await setOverride({
      flagKey: "off-by-default",
      enabled: true,
      organizationId: ORG_A,
    })
    expect(
      await isEnabled("test.off-by-default", { organizationId: ORG_A }),
    ).toBe(true)
  })

  it("user-scoped override at one user does NOT leak to a different user", async () => {
    await setOverride({
      flagKey: "off-by-default",
      enabled: true,
      userId: USER_A,
    })
    expect(
      await isEnabled("test.off-by-default", { userId: USER_A }),
    ).toBe(true)
    expect(
      await isEnabled("test.off-by-default", { userId: USER_B }),
    ).toBe(false)
  })

  it("org-scoped override does NOT leak across orgs", async () => {
    await setOverride({
      flagKey: "off-by-default",
      enabled: true,
      organizationId: ORG_A,
    })
    expect(
      await isEnabled("test.off-by-default", { organizationId: ORG_A }),
    ).toBe(true)
    expect(
      await isEnabled("test.off-by-default", { organizationId: ORG_B }),
    ).toBe(false)
  })
})

describe("feature-flags/resolve getFlags — multi-key batching", () => {
  it("returns the resolved value for every requested key in one round-trip", async () => {
    await setOverride({ flagKey: "off-by-default", enabled: true }) // global flip
    const result = await getFlags(
      ["test.off-by-default", "test.on-by-default", "test.another-flag"],
      {},
    )
    expect(result).toEqual({
      "test.off-by-default": true,
      "test.on-by-default": true,
      "test.another-flag": false,
    })
  })

  it("returns false for an unknown flag passed alongside known ones", async () => {
    const result = await getFlags(
      ["test.on-by-default", "test.does-not-exist"],
      {},
    )
    expect(result).toEqual({
      "test.on-by-default": true,
      "test.does-not-exist": false,
    })
  })

  it("returns an empty object for an empty key list (short-circuit)", async () => {
    expect(await getFlags([], {})).toEqual({})
  })
})

describe("feature-flags/resolve — FK cascade on FeatureFlag delete", () => {
  it("removing a FeatureFlag row deletes its FeatureFlagOverride rows", async () => {
    await setOverride({
      flagKey: "off-by-default",
      enabled: true,
      organizationId: ORG_A,
    })
    const db = getDb()
    const before = await db.featureFlagOverride.count({
      where: { module: "test", flagKey: "off-by-default" },
    })
    expect(before).toBe(1)
    await db.featureFlag.delete({
      where: { module_key: { module: "test", key: "off-by-default" } },
    })
    const after = await db.featureFlagOverride.count({
      where: { module: "test", flagKey: "off-by-default" },
    })
    expect(after).toBe(0)
  })
})
