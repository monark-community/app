import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { t } from "@monark/common/trpc";
import { assignRole, createRole } from "@monark/rbac/server";
import { createDataField, createDataModel, createDataRecord } from "../../src/server/data";
import { registerDataModelsPermissions } from "../../src/server/permissions";
import { registerDataModelRegistrations } from "../../src/server/registrations";
import { dataModelsRouter } from "../../src/server/router";

// MQL-scoped record permissions: "this role may read the records matching this
// query". The rules that matter, and that a regression here would break:
//
//  - roles are ADDITIVE, so one unscoped granting role keeps you unrestricted ;
//  - a scoped-out record is a 404, never a 403, so nothing leaks ;
//  - the scope applies on EVERY path that reaches a record, not just list ;
//  - a stored scope that cannot be parsed DENIES rather than ceasing to filter.

const ORG = "dm-scope-org";
const U_EU = "dm-scope-eu"; // scoped to region:eu
const U_BOTH = "dm-scope-both"; // scoped role + an unscoped granting role
const U_MINE = "dm-scope-mine"; // scoped to owner:@me
const U_OTHER = "dm-scope-other"; // same @me scope, different person
const U_VIEWALL = "dm-scope-viewall"; // scoped role + view-all-records
const U_ADMIN = "dm-scope-admin";
const ADMIN_BUILTIN_ID = "role_admin_builtin";

const ALL_USERS = [U_EU, U_BOTH, U_MINE, U_OTHER, U_VIEWALL, U_ADMIN];

const createCaller = t.createCallerFactory(dataModelsRouter);
const callerFor = (userId: string) =>
  createCaller({ userId, activeOrganizationId: ORG, requestId: "scope-test" });

let modelId = "";
let euId = "";
let usId = "";
let euRoleId = "";

beforeAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL_USERS } } });

  registerDataModelsPermissions();
  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  for (const id of ALL_USERS) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }

  const model = await createDataModel({
    organizationId: ORG,
    key: "deals",
    name: "Deals",
    createdBy: U_ADMIN,
  });
  modelId = model.id;
  registerDataModelRegistrations({ key: model.key, name: model.name });
  for (const [key, type] of [
    ["region", "TEXT"],
    ["owner", "TEXT"],
  ] as const) {
    await createDataField({ dataModelId: modelId, key, label: key, type, config: {} });
  }

  const eu = await createDataRecord({
    dataModelId: modelId,
    data: { title: "EU deal", region: "eu", owner: U_MINE },
    createdBy: U_ADMIN,
  });
  const us = await createDataRecord({
    dataModelId: modelId,
    data: { title: "US deal", region: "us", owner: U_OTHER },
    createdBy: U_ADMIN,
  });
  euId = eu.id;
  usId = us.id;

  const mkRole = async (key: string, permissions: string[]) =>
    createRole({ organizationId: ORG, key, name: key, permissions, createdById: U_ADMIN });
  const grant = async (userId: string, roleId: string) =>
    assignRole({ userId, roleId, organizationId: ORG, grantedById: null });

  // Scoped to the EU region. Holds write + delete too, so the write-path specs
  // exercise the SCOPE rather than tripping the model-level permission first
  // (a read-only role is denied at that earlier layer with a 403).
  const euRole = await mkRole("scope-eu", [
    "data-models.record-read",
    "data-models.record-write",
    "data-models.record-delete",
  ]);
  euRoleId = euRole.id;
  await grant(U_EU, euRole.id);
  await grant(U_BOTH, euRole.id);
  await grant(U_VIEWALL, euRole.id);

  // An UNSCOPED role that also grants read : proves roles stay additive.
  const openRole = await mkRole("scope-open", ["data-models.record-read"]);
  await grant(U_BOTH, openRole.id);

  // Scoped to owner:@me.
  const mineRole = await mkRole("scope-mine", ["data-models.record-read"]);
  await grant(U_MINE, mineRole.id);
  await grant(U_OTHER, mineRole.id);

  const viewAllRole = await mkRole("scope-viewall", ["data-models.view-all-records"]);
  await grant(U_VIEWALL, viewAllRole.id);

  await grant(U_ADMIN, ADMIN_BUILTIN_ID);

  const admin = callerFor(U_ADMIN);
  await admin.scopes.set({
    dataModelId: modelId,
    roleId: euRole.id,
    verb: "READ",
    query: "region:eu",
  });
  await admin.scopes.set({
    dataModelId: modelId,
    roleId: mineRole.id,
    verb: "READ",
    query: "owner:@me",
  });
});

afterAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: ALL_USERS } } });
});

const titles = async (userId: string) =>
  (await callerFor(userId).records.list({ dataModelId: modelId })).items.map((r) => r.title).sort();

const notFound = async (p: Promise<unknown>) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  const cause = (err as { cause?: { code?: string; statusCode?: number } }).cause;
  expect(cause?.code).toBe("not_found");
  expect(cause?.statusCode).toBe(404);
};

describe("a scope narrows what a role can read", () => {
  it("lists only the records matching the scope", async () => {
    expect(await titles(U_EU)).toEqual(["EU deal"]);
  });

  it("404s a scoped-out record by id, so its existence does not leak", async () => {
    await notFound(callerFor(U_EU).records.getById({ id: usId }));
    const ok = await callerFor(U_EU).records.getById({ id: euId });
    expect(ok.title).toBe("EU deal");
  });

  it("refuses to update or delete a scoped-out record it otherwise has rights on", async () => {
    // This role DOES hold record-write / record-delete, so a 404 here is the
    // scope talking, not the model-level permission check.
    await notFound(callerFor(U_EU).records.update({ id: usId, data: { title: "hijacked" } }));
    await notFound(callerFor(U_EU).records.delete({ id: usId }));

    // ...and the in-scope record is still writable, so this is not a blanket denial.
    const ok = await callerFor(U_EU).records.update({
      id: euId,
      data: { title: "EU deal", region: "eu", owner: U_MINE },
    });
    expect(ok.title).toBe("EU deal");
  });

  it("keeps global search from surfacing a scoped-out record", async () => {
    // The side door: search reaches records without going through records.list.
    const { dataModelsSearchSource } = await import("../../src/server/search-source");
    const hits = await dataModelsSearchSource.run(
      { userId: U_EU, activeOrganizationId: ORG, requestId: "scope-search" },
      "deal",
      10,
    );
    expect(hits.map((h) => h.title)).toEqual(["EU deal"]);
  });
});

describe("roles are additive", () => {
  it("an unscoped granting role restores full visibility", async () => {
    // U_BOTH holds the SAME scoped role as U_EU, plus an unscoped one. A scope
    // narrows only the access its own role confers, so the union is everything.
    expect(await titles(U_BOTH)).toEqual(["EU deal", "US deal"]);
  });
});

describe("@me resolves per caller", () => {
  it("gives two holders of the same scope different rows", async () => {
    expect(await titles(U_MINE)).toEqual(["EU deal"]);
    expect(await titles(U_OTHER)).toEqual(["US deal"]);
  });
});

describe("bypass", () => {
  it("view-all-records ignores the scope", async () => {
    expect(await titles(U_VIEWALL)).toEqual(["EU deal", "US deal"]);
  });

  it("built-in ADMIN ignores the scope", async () => {
    expect(await titles(U_ADMIN)).toEqual(["EU deal", "US deal"]);
  });
});

describe("failure modes", () => {
  it("denies everything when a stored scope cannot be parsed", async () => {
    // A filter that silently stops filtering is an authorization bug, not a
    // 400 ; a corrupted row must fail CLOSED.
    const db = getDb();
    const before = await titles(U_EU);
    expect(before).toEqual(["EU deal"]);

    await db.dataModelRoleScope.updateMany({
      where: { roleId: euRoleId, dataModelId: modelId, verb: "READ" },
      data: { query: { kind: "nonsense", not: "a filter" } },
    });
    expect(await titles(U_EU)).toEqual([]);
    await notFound(callerFor(U_EU).records.getById({ id: euId }));

    // restore for any later test
    await db.dataModelRoleScope.updateMany({
      where: { roleId: euRoleId, dataModelId: modelId, verb: "READ" },
      data: { query: { kind: "leaf", field: "region", op: "is", value: "eu" } },
    });
    expect(await titles(U_EU)).toEqual(["EU deal"]);
  });

  it("rejects a dotted, relation-traversing field in a scope", async () => {
    // A traversal reads the TARGET model, so its evaluation could depend on
    // rows the scoped role cannot see. Refused up front rather than
    // half-solved. Two guards catch it: the parser (this model has no relation
    // called `owner`) and `upsertScope`'s explicit traversal check.
    await expect(
      callerFor(U_ADMIN).scopes.set({
        dataModelId: modelId,
        roleId: euRoleId,
        verb: "READ",
        query: "owner.title:x",
      }),
    ).rejects.toThrow();
  });

  it("rejects a scope naming a field the model does not have", async () => {
    // Parsed server-side against the model's REAL fields, so a typo is an
    // error now rather than a query that breaks later.
    await expect(
      callerFor(U_ADMIN).scopes.set({
        dataModelId: modelId,
        roleId: euRoleId,
        verb: "READ",
        query: "regionn:eu",
      }),
    ).rejects.toThrow();
  });

  it("rejects an empty scope, which would be a rule that narrows nothing", async () => {
    await expect(
      callerFor(U_ADMIN).scopes.set({
        dataModelId: modelId,
        roleId: euRoleId,
        verb: "READ",
        query: "   ",
      }),
    ).rejects.toThrow();
  });
});

describe("managing scopes is not the same power as managing schemas", () => {
  it("denies a manage-schema holder without manage-record-scopes", async () => {
    // Otherwise a data steward could delete the scope constraining their own
    // role and widen their own access.
    const steward = "dm-scope-steward";
    const db = getDb();
    await db.user.create({ data: { id: steward, email: `${steward}@test.local` } });
    await db.organizationMembership.create({ data: { userId: steward, organizationId: ORG } });
    const role = await createRole({
      organizationId: ORG,
      key: "scope-steward",
      name: "scope-steward",
      permissions: ["data-models.manage-schema", "data-models.record-read"],
      createdById: U_ADMIN,
    });
    await assignRole({ userId: steward, roleId: role.id, organizationId: ORG, grantedById: null });

    await expect(
      callerFor(steward).scopes.clear({ dataModelId: modelId, roleId: euRoleId, verb: "READ" }),
    ).rejects.toThrow();
    await expect(callerFor(steward).scopes.list({ dataModelId: modelId })).rejects.toThrow();
  });
});
