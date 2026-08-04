import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { t } from "@monark/common/trpc";
import { assignRole, createRole } from "@monark/rbac/server";
import { createDataModel } from "../../src/server/data";
import { registerDataModelsPermissions } from "../../src/server/permissions";
import { dataModelsRouter } from "../../src/server/router";
import { leaf } from "../../src/contracts/query";

// Saved views through the REAL tRPC procedures : read gated by record-read,
// edit scoped to the owner, and personal-vs-shared visibility. A regression
// here leaks or lets a non-owner mutate someone's saved query.

const ORG = "dm-views-org";
const OWNER = "dm-views-owner"; // record-read
const OTHER = "dm-views-other"; // record-read
const OUTSIDER = "dm-views-outsider"; // member, no role
const ALL = [OWNER, OTHER, OUTSIDER];

const createCaller = t.createCallerFactory(dataModelsRouter);
const callerFor = (userId: string) =>
  createCaller({ userId, activeOrganizationId: ORG, requestId: "views-test" });

let modelId = "";
const QUERY = leaf("title", "contains", "x");

beforeAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL } } });
  registerDataModelsPermissions();

  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  for (const id of ALL) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }

  const readerRole = await createRole({
    organizationId: ORG,
    key: "dm-views-reader",
    name: "Reader",
    permissions: ["data-models.record-read"],
    createdById: OWNER,
  });
  for (const id of [OWNER, OTHER]) {
    await assignRole({ userId: id, roleId: readerRole.id, organizationId: ORG, grantedById: null });
  }

  const model = await createDataModel({
    organizationId: ORG,
    key: "issues",
    name: "Issues",
    createdBy: OWNER,
  });
  modelId = model.id;
});

afterAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL } } });
});

describe("views router", () => {
  let viewId = "";

  it("denies list to a member without record-read", async () => {
    await expect(callerFor(OUTSIDER).views.list({ dataModelId: modelId })).rejects.toThrow();
  });

  it("creates a personal view (mine, not shared)", async () => {
    const view = await callerFor(OWNER).views.create({
      dataModelId: modelId,
      name: "My open issues",
      query: QUERY,
    });
    viewId = view.id;
    expect(view.mine).toBe(true);
    expect(view.shared).toBe(false);
    expect(view.query).toEqual(QUERY);
  });

  it("a personal view is invisible to another user", async () => {
    const mine = await callerFor(OWNER).views.list({ dataModelId: modelId });
    expect(mine.map((v) => v.id)).toContain(viewId);
    const theirs = await callerFor(OTHER).views.list({ dataModelId: modelId });
    expect(theirs.map((v) => v.id)).not.toContain(viewId);
  });

  it("sharing it makes it visible to others (as not-mine)", async () => {
    await callerFor(OWNER).views.update({ id: viewId, shared: true });
    const theirs = await callerFor(OTHER).views.list({ dataModelId: modelId });
    const seen = theirs.find((v) => v.id === viewId);
    expect(seen).toBeTruthy();
    expect(seen!.mine).toBe(false);
    expect(seen!.shared).toBe(true);
  });

  it("a non-owner cannot update or delete a shared view", async () => {
    await expect(callerFor(OTHER).views.update({ id: viewId, name: "hijack" })).rejects.toThrow();
    await expect(callerFor(OTHER).views.delete({ id: viewId })).rejects.toThrow();
  });

  it("the owner can rename + delete their view", async () => {
    const renamed = await callerFor(OWNER).views.update({ id: viewId, name: "Renamed" });
    expect(renamed.name).toBe("Renamed");
    await callerFor(OWNER).views.delete({ id: viewId });
    const left = await callerFor(OWNER).views.list({ dataModelId: modelId });
    expect(left.map((v) => v.id)).not.toContain(viewId);
  });
});
