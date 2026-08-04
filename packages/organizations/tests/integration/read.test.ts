import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@monark/db";
import { NotFoundError } from "@monark/common";

// getCurrentOrg consults `tenancy.multi-tenant` ; stub the flag module so the
// test doesn't depend on a flag-eval service. Default OFF (single-tenant),
// matching production ; the multi-tenant case overrides per-test.
const isEnabledMock = vi.fn(async () => false);
vi.mock("@monark/feature-flags/server", () => ({
  isEnabled: (...args: unknown[]) => isEnabledMock(...(args as [])),
}));

import {
  getById,
  getByIdOrThrow,
  getBySlug,
  getCurrentOrg,
  getUserOrgs,
  requireOrg,
} from "../../src/server/read";

const USER = "org-read-user";
const OUTSIDER = "org-read-outsider";

async function resetAll(): Promise<void> {
  const db = getDb();
  await db.organizationMembership.deleteMany({});
  await db.organization.deleteMany({});
  await db.user.deleteMany({ where: { id: { in: [USER, OUTSIDER] } } });
}

async function seedUsers(): Promise<void> {
  const db = getDb();
  for (const id of [USER, OUTSIDER])
    await db.user.create({ data: { id, email: `${id}@test.local` } });
}

async function makeOrg(
  id: string,
  opts: { member?: string; deleted?: boolean } = {},
): Promise<void> {
  const db = getDb();
  await db.organization.create({
    data: { id, slug: id, displayName: id, ...(opts.deleted ? { deletedAt: new Date() } : {}) },
  });
  if (opts.member)
    await db.organizationMembership.create({ data: { userId: opts.member, organizationId: id } });
}

beforeEach(async () => {
  isEnabledMock.mockReset();
  isEnabledMock.mockResolvedValue(false);
  await resetAll();
  await seedUsers();
});

afterEach(resetAll);

describe("organizations/read basic lookups", () => {
  it("getById / getBySlug find an org ; getByIdOrThrow throws NotFound when missing", async () => {
    await makeOrg("acme");
    expect((await getById("acme"))?.id).toBe("acme");
    expect((await getBySlug("acme"))?.id).toBe("acme");
    expect(await getById("nope")).toBeNull();
    expect((await getByIdOrThrow("acme")).id).toBe("acme");
    await expect(getByIdOrThrow("nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getUserOrgs returns only the orgs the user belongs to", async () => {
    await makeOrg("a", { member: USER });
    await makeOrg("b", { member: USER });
    await makeOrg("c"); // USER is not a member
    const orgs = await getUserOrgs(USER);
    expect(orgs.map((o) => o.id).sort()).toEqual(["a", "b"]);
  });
});

describe("organizations/read getCurrentOrg", () => {
  it("returns null when there is no signed-in user", async () => {
    expect(await getCurrentOrg({ userId: null, activeOrganizationId: "acme" })).toBeNull();
  });

  it("returns the active org when the user is still a member", async () => {
    await makeOrg("acme", { member: USER });
    const org = await getCurrentOrg({ userId: USER, activeOrganizationId: "acme" });
    expect(org?.id).toBe("acme");
  });

  it("returns null when the active-org claim is stale (membership gone)", async () => {
    await makeOrg("acme"); // exists, but USER has no membership
    expect(await getCurrentOrg({ userId: USER, activeOrganizationId: "acme" })).toBeNull();
  });

  it("multi-tenant with no active-org claim returns null (route to switcher)", async () => {
    isEnabledMock.mockResolvedValue(true);
    await makeOrg("acme", { member: USER });
    expect(await getCurrentOrg({ userId: USER, activeOrganizationId: null })).toBeNull();
  });

  it("single-tenant with no claim falls back to the sole active org", async () => {
    await makeOrg("only", { member: USER });
    const org = await getCurrentOrg({ userId: OUTSIDER, activeOrganizationId: null });
    // Fallback is membership-agnostic in single-tenant : any signed-in user resolves.
    expect(org?.id).toBe("only");
  });

  it("single-tenant fallback returns null when the org count isn't exactly one", async () => {
    await makeOrg("one");
    await makeOrg("two");
    expect(await getCurrentOrg({ userId: USER, activeOrganizationId: null })).toBeNull();
  });

  it("ignores soft-deleted orgs in the single-tenant count", async () => {
    await makeOrg("live");
    await makeOrg("dead", { deleted: true });
    // Only one ACTIVE org → fallback resolves it.
    expect((await getCurrentOrg({ userId: USER, activeOrganizationId: null }))?.id).toBe("live");
  });
});

describe("organizations/read requireOrg", () => {
  it("returns the org when present, throws NotFound when absent", async () => {
    await makeOrg("acme", { member: USER });
    expect((await requireOrg({ userId: USER, activeOrganizationId: "acme" })).id).toBe("acme");
    await expect(
      requireOrg({ userId: USER, activeOrganizationId: "missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
