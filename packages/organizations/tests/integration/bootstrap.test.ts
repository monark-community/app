import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";

import {
  bootstrapSingletonOrganization,
  ensureSingletonOrganizationFromInput,
  getBootstrapStatus,
  getSingletonOrganization,
} from "../../src/server/bootstrap";

// Clean the org tables BEFORE each test (not only after) so this file is
// independently runnable regardless of what a prior spec file left behind —
// the "no orgs exist" case asserts on entry state. `afterEach` repeats the
// cleanup so the next spec file also starts clean.
async function resetOrgTables(): Promise<void> {
  const db = getDb();
  await db.organizationMembership.deleteMany({});
  await db.invite.deleteMany({});
  await db.orgSlugRedirect.deleteMany({});
  await db.organization.deleteMany({});
}

beforeEach(async () => {
  await resetOrgTables();
});

afterEach(resetOrgTables);

describe("getBootstrapStatus", () => {
  it("reports single-tenant + not bootstrapped when no orgs exist", async () => {
    const status = await getBootstrapStatus();
    expect(status).toEqual({
      bootstrapped: false,
      organizationCount: 0,
      singletonOrganizationId: null,
      singletonDisplayName: null,
      singletonLogoUrl: null,
      singletonPrimaryColor: null,
    });
  });

  it("reports bootstrapped + the singleton id + branding when exactly one org exists", async () => {
    const db = getDb();
    const row = await db.organization.create({
      data: {
        slug: "acme",
        displayName: "Acme",
        logoUrl: "https://example.com/acme.png",
        primaryColor: "#0066FF",
      },
    });
    const status = await getBootstrapStatus();
    expect(status.bootstrapped).toBe(true);
    expect(status.organizationCount).toBe(1);
    expect(status.singletonOrganizationId).toBe(row.id);
    expect(status.singletonDisplayName).toBe("Acme");
    expect(status.singletonLogoUrl).toBe("https://example.com/acme.png");
    expect(status.singletonPrimaryColor).toBe("#0066FF");
  });

  it("rejects an invalid hex format from the DB defensively (singletonPrimaryColor falls back to null)", async () => {
    const db = getDb();
    await db.organization.create({
      data: {
        slug: "borked",
        displayName: "Borked",
        primaryColor: "javascript:alert(1)",
      },
    });
    const status = await getBootstrapStatus();
    expect(status.singletonOrganizationId).not.toBeNull();
    expect(status.singletonPrimaryColor).toBeNull();
  });

  it("does not pin singletonOrganizationId when multiple orgs exist", async () => {
    const db = getDb();
    await db.organization.createMany({
      data: [
        { slug: "a", displayName: "A" },
        { slug: "b", displayName: "B" },
      ],
    });
    const status = await getBootstrapStatus();
    expect(status.organizationCount).toBe(2);
    expect(status.bootstrapped).toBe(true);
    expect(status.singletonOrganizationId).toBeNull();
  });
});

describe("getSingletonOrganization", () => {
  it("returns null when no organization exists", async () => {
    const result = await getSingletonOrganization();
    expect(result).toBeNull();
  });

  it("returns the row when exactly one org exists", async () => {
    const db = getDb();
    await db.organization.create({
      data: { slug: "single", displayName: "Single" },
    });
    const result = await getSingletonOrganization();
    expect(result?.slug).toBe("single");
  });
});

describe("ensureSingletonOrganizationFromInput — happy path", () => {
  it("creates the singleton when the system is not yet bootstrapped", async () => {
    const result = await ensureSingletonOrganizationFromInput({
      slug: "monark",
      displayName: "Monark Inc.",
      primaryColor: "#0c4a6e",
      actorId: "system:bootstrap",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.created).toBe(true);
      expect(result.organizationId).toBeTruthy();
    }
    const db = getDb();
    const row = await db.organization.findFirst({ where: { slug: "monark" } });
    expect(row?.displayName).toBe("Monark Inc.");
    expect(row?.primaryColor).toBe("#0c4a6e");
  });

  it("is idempotent — second call returns the existing org with created=false", async () => {
    const first = await ensureSingletonOrganizationFromInput({
      slug: "monark",
      displayName: "Monark Inc.",
      actorId: "system:bootstrap",
    });
    const second = await ensureSingletonOrganizationFromInput({
      slug: "monark",
      displayName: "Different Name",
      actorId: "system:bootstrap",
    });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.organizationId).toBe(second.organizationId);
      expect(second.created).toBe(false);
    }
    const db = getDb();
    const all = await db.organization.findMany();
    expect(all).toHaveLength(1);
    // First-call name stuck ; idempotent path doesn't mutate.
    expect(all[0]?.displayName).toBe("Monark Inc.");
  });
});

describe("ensureSingletonOrganizationFromInput — guards", () => {
  it("returns env-not-set when slug or displayName is missing", async () => {
    const noSlug = await ensureSingletonOrganizationFromInput({
      slug: null,
      displayName: "Has Name",
      actorId: "system:bootstrap",
    });
    expect(noSlug).toEqual({ ok: false, reason: "env-not-set" });
    const noName = await ensureSingletonOrganizationFromInput({
      slug: "has-slug",
      displayName: null,
      actorId: "system:bootstrap",
    });
    expect(noName).toEqual({ ok: false, reason: "env-not-set" });
  });

  it("returns invalid-slug for slugs that don't match the regex / length", async () => {
    const badShape = await ensureSingletonOrganizationFromInput({
      slug: "Bad Slug!",
      displayName: "X",
      actorId: "system:bootstrap",
    });
    expect(badShape.ok).toBe(false);
    if (!badShape.ok) {
      expect(badShape.reason).toBe("invalid-slug");
      expect(badShape.detail).toBe("Bad Slug!");
    }
    const tooShort = await ensureSingletonOrganizationFromInput({
      slug: "a",
      displayName: "X",
      actorId: "system:bootstrap",
    });
    expect(tooShort.ok).toBe(false);
    if (!tooShort.ok) expect(tooShort.reason).toBe("invalid-slug");
  });

  it("returns invalid-color for non-hex primaryColor", async () => {
    const result = await ensureSingletonOrganizationFromInput({
      slug: "okay",
      displayName: "Okay",
      primaryColor: "not-a-color",
      actorId: "system:bootstrap",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-color");
      expect(result.detail).toBe("not-a-color");
    }
  });

  it("accepts both 3-digit and 6-digit hex primaryColor", async () => {
    const r1 = await ensureSingletonOrganizationFromInput({
      slug: "short-hex",
      displayName: "Short",
      primaryColor: "#abc",
      actorId: "system:bootstrap",
    });
    expect(r1.ok).toBe(true);
    // Reset for the next case.
    const db = getDb();
    await db.organization.deleteMany();
    const r2 = await ensureSingletonOrganizationFromInput({
      slug: "long-hex",
      displayName: "Long",
      primaryColor: "#abcdef",
      actorId: "system:bootstrap",
    });
    expect(r2.ok).toBe(true);
  });
});

describe("bootstrapSingletonOrganization — direct", () => {
  it("creates + emits when no org exists", async () => {
    const result = await bootstrapSingletonOrganization({
      slug: "first",
      displayName: "First",
      actorId: "system:bootstrap",
    });
    expect(result.created).toBe(true);
    expect(result.organizationId).toBeTruthy();
  });

  it("returns the existing row + created=false when a singleton already exists", async () => {
    const db = getDb();
    const existing = await db.organization.create({
      data: { slug: "already", displayName: "Already" },
    });
    const result = await bootstrapSingletonOrganization({
      slug: "different",
      displayName: "Different",
      actorId: "system:bootstrap",
    });
    expect(result.created).toBe(false);
    expect(result.organizationId).toBe(existing.id);
  });

  it("throws when multiple orgs already exist (operator flipped to single after multi)", async () => {
    const db = getDb();
    await db.organization.createMany({
      data: [
        { slug: "one", displayName: "One" },
        { slug: "two", displayName: "Two" },
      ],
    });
    await expect(
      bootstrapSingletonOrganization({
        slug: "three",
        displayName: "Three",
        actorId: "system:bootstrap",
      }),
    ).rejects.toThrow(/multiple organizations/i);
  });
});
