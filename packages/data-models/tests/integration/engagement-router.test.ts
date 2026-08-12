import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { t } from "@monark/common/trpc";
import { setOverride, syncFlagsToDatabase } from "@monark/feature-flags/server";
import { assignRole, createRole } from "@monark/rbac/server";
import { createDataModel, createDataRecord } from "../../src/server/data";
import { createDataForm } from "../../src/server/forms";
import { registerDataModelsPermissions } from "../../src/server/permissions";
import { registerDataModelsFeatureFlags } from "../../src/server/flags";
import { dataModelsRouter } from "../../src/server/router";

// The public engagement procedures through the REAL tRPC router : the flag +
// per-model gates, published-record gate, and login/anonymous identity rules.

const ORG = "dm-engrt-org";
const USER = "dm-engrt-user"; // plain logged-in user
const ADMIN = "dm-engrt-admin"; // manage-forms
const ALL = [USER, ADMIN];

const createCaller = t.createCallerFactory(dataModelsRouter);
const caller = (userId: string | null) =>
  createCaller({ userId, activeOrganizationId: ORG, requestId: "engrt-test" });

let voteForm = { token: "", publishedId: "", unpublishedId: "" };
let noDiscussForm = { token: "", publishedId: "" };

beforeAll(async () => {
  const db = getDb();
  registerDataModelsPermissions();
  registerDataModelsFeatureFlags();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL } } });
  await db.featureFlagOverride.deleteMany({ where: { flagKey: "public-forms" } });

  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  for (const id of ALL) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }
  const adminRole = await createRole({
    organizationId: ORG,
    key: "dm-engrt-mgr",
    name: "Board manager",
    permissions: ["data-models.manage-forms"],
    createdById: ADMIN,
  });
  await assignRole({ userId: ADMIN, roleId: adminRole.id, organizationId: ORG, grantedById: null });

  await syncFlagsToDatabase(); // persist flag definitions so the override FK resolves
  await setOverride("data-models.public-forms", {}, true, ADMIN); // global on

  // Model with voting + discussions on ; a published board record + an
  // unpublished one.
  const model = await createDataModel({
    organizationId: ORG,
    key: "reqs",
    name: "Reqs",
    createdBy: ADMIN,
  });
  await db.dataModel.update({
    where: { id: model.id },
    data: { votingEnabled: true, discussionsEnabled: true },
  });
  const published = await createDataRecord({
    dataModelId: model.id,
    data: { title: "Pub" },
    createdBy: ADMIN,
  });
  const unpublished = await createDataRecord({
    dataModelId: model.id,
    data: { title: "Draft" },
    createdBy: ADMIN,
  });
  const form = await createDataForm({
    organizationId: ORG,
    dataModelId: model.id,
    name: "Board",
    mode: "ANONYMOUS",
    fieldKeys: [],
    listEnabled: true,
    listReadFieldKeys: [],
    listPublicRead: true,
    createdBy: ADMIN,
  });
  await db.dataFormEntry.create({
    data: { dataFormId: form.id, recordId: published.id, status: "PUBLISHED" },
  });
  voteForm = { token: form.token, publishedId: published.id, unpublishedId: unpublished.id };

  // A second model with voting on but discussions OFF.
  const model2 = await createDataModel({
    organizationId: ORG,
    key: "reqs2",
    name: "Reqs2",
    createdBy: ADMIN,
  });
  await db.dataModel.update({ where: { id: model2.id }, data: { votingEnabled: true } });
  const pub2 = await createDataRecord({
    dataModelId: model2.id,
    data: { title: "P2" },
    createdBy: ADMIN,
  });
  const form2 = await createDataForm({
    organizationId: ORG,
    dataModelId: model2.id,
    name: "Board2",
    mode: "ANONYMOUS",
    fieldKeys: [],
    listEnabled: true,
    listReadFieldKeys: [],
    listPublicRead: true,
    createdBy: ADMIN,
  });
  await db.dataFormEntry.create({
    data: { dataFormId: form2.id, recordId: pub2.id, status: "PUBLISHED" },
  });
  noDiscussForm = { token: form2.token, publishedId: pub2.id };
});

afterAll(async () => {
  const db = getDb();
  await db.featureFlagOverride.deleteMany({ where: { flagKey: "public-forms" } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL } } });
});

describe("forms.public.vote", () => {
  it("lets a logged-in user vote on a published record", async () => {
    const res = await caller(USER).forms.public.vote({
      token: voteForm.token,
      recordId: voteForm.publishedId,
    });
    expect(res).toEqual({ count: 1, hasVoted: true });
    // Toggling off returns to zero.
    const off = await caller(USER).forms.public.vote({
      token: voteForm.token,
      recordId: voteForm.publishedId,
    });
    expect(off).toEqual({ count: 0, hasVoted: false });
  });

  it("rejects an anonymous voter (no login, no invite)", async () => {
    await expect(
      caller(null).forms.public.vote({ token: voteForm.token, recordId: voteForm.publishedId }),
    ).rejects.toThrow();
  });

  it("404s a vote on an unpublished record", async () => {
    await expect(
      caller(USER).forms.public.vote({ token: voteForm.token, recordId: voteForm.unpublishedId }),
    ).rejects.toThrow();
  });
});

describe("forms.public.comments", () => {
  it("lets a logged-in user post, then lists it publicly", async () => {
    await caller(USER).forms.public.comments.post({
      token: voteForm.token,
      recordId: voteForm.publishedId,
      body: "  <b>hello</b>  ",
    });
    const page = await caller(null).forms.public.comments.list({
      token: voteForm.token,
      recordId: voteForm.publishedId,
    });
    expect(page.items.map((c) => c.body)).toContain("hello");
  });

  it("rejects an anonymous (logged-out) comment", async () => {
    await expect(
      caller(null).forms.public.comments.post({
        token: voteForm.token,
        recordId: voteForm.publishedId,
        body: "hi",
      }),
    ).rejects.toThrow();
  });

  it("404s comments when discussions are disabled on the model", async () => {
    await expect(
      caller(USER).forms.public.comments.post({
        token: noDiscussForm.token,
        recordId: noDiscussForm.publishedId,
        body: "hi",
      }),
    ).rejects.toThrow();
  });
});
