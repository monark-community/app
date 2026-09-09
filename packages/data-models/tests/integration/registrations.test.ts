import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { orgVisibleEventTypes } from "@monark/common";
import { orgVisiblePermissionKeys } from "@monark/rbac/server";
import { truncate } from "@monark/test-utils/db";
import { createDataModel, softDeleteDataModel } from "../../src/server/data";
import { registerDataModelVisibilityResolvers } from "../../src/server/registrations";

// Integration coverage for the org-scoped visibility resolvers — the layer
// that keeps one org's per-model permissions + event types out of another
// org's RBAC catalog / webhook picker, even though the entries themselves are
// globally registered. This is the org-isolation guarantee.
//
// Vitest isolates modules per test file, so the resolver arrays start empty
// here ; we register once in beforeAll. The resolvers query the DB per call,
// scoped to the org id we pass, and ORG_A / ORG_B are unique to this file.

const ORG_A = "dm-vis-org-a";
const ORG_B = "dm-vis-org-b";
const ACTOR = "dm-vis-actor";

beforeAll(async () => {
  const db = getDb();
  for (const id of [ORG_A, ORG_B]) {
    await db.organization.upsert({
      where: { id },
      create: { id, slug: id, displayName: id },
      update: {},
    });
  }
  await db.user.upsert({
    where: { id: ACTOR },
    create: { id: ACTOR, email: `${ACTOR}@test.local` },
    update: {},
  });
  registerDataModelVisibilityResolvers();
});

afterAll(async () => {
  await truncate(getDb(), ["DataModel"]);
  const db = getDb();
  await db.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
  await db.user.deleteMany({ where: { id: ACTOR } });
});

describe("data-models/registrations — org-scoped visibility resolvers", () => {
  it("shows an org only its own models' per-model permissions + event types", async () => {
    await createDataModel({ organizationId: ORG_A, key: "alpha", name: "Alpha", createdBy: ACTOR });
    await createDataModel({ organizationId: ORG_B, key: "beta", name: "Beta", createdBy: ACTOR });

    const permsA = await orgVisiblePermissionKeys(ORG_A);
    expect(permsA.has("data-models.alpha-record-read")).toBe(true);
    expect(permsA.has("data-models.alpha-record-write")).toBe(true);
    expect(permsA.has("data-models.alpha-record-delete")).toBe(true);
    // ORG_B's model must NOT leak into ORG_A's catalog.
    expect(permsA.has("data-models.beta-record-read")).toBe(false);

    const eventsA = await orgVisibleEventTypes(ORG_A);
    expect(eventsA.has("data-models.alpha-record-created")).toBe(true);
    expect(eventsA.has("data-models.alpha-record-updated")).toBe(true);
    expect(eventsA.has("data-models.alpha-record-deleted")).toBe(true);
    expect(eventsA.has("data-models.beta-record-created")).toBe(false);
  });

  it("returns an empty set for a null org (platform context leaks nothing)", async () => {
    expect((await orgVisiblePermissionKeys(null)).size).toBe(0);
    expect((await orgVisibleEventTypes(null)).size).toBe(0);
  });

  it("drops a model's entries once it is soft-deleted", async () => {
    const model = await createDataModel({
      organizationId: ORG_A,
      key: "gamma",
      name: "Gamma",
      createdBy: ACTOR,
    });
    expect((await orgVisiblePermissionKeys(ORG_A)).has("data-models.gamma-record-read")).toBe(true);

    await softDeleteDataModel(model.id);
    const perms = await orgVisiblePermissionKeys(ORG_A);
    expect(perms.has("data-models.gamma-record-read")).toBe(false);
    const events = await orgVisibleEventTypes(ORG_A);
    expect(events.has("data-models.gamma-record-created")).toBe(false);
  });
});
