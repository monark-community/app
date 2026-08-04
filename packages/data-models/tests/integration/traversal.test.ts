import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, Prisma } from "@monark/db";
import { t } from "@monark/common/trpc";
import { assignRole } from "@monark/rbac/server";
import {
  buildCompileFields,
  createDataField,
  createDataModel,
  createDataRecord,
  listDataFields,
  listDataRecordsWithQuery,
  type DataModelRow,
} from "../../src/server/data";
import { dataModelsRouter } from "../../src/server/router";
import { leaf, type FilterNode } from "../../src/contracts/query";
import type { RelationTargets } from "../../src/server/query-compiler";

// Relation traversal (`assignee.title contains x`) : the compiler's EXISTS
// subquery over a target model's records, for a scalar (ONE) and an array
// (MANY) relation, plus the router path that resolves the target models. A
// regression here filters on the wrong related rows or fails to scope the
// subquery to the target model.

const ORG = "dm-trav-org";
const ADMIN = "dm-trav-admin";
const ADMIN_BUILTIN_ID = "role_admin_builtin";

let people: DataModelRow;
let issues: DataModelRow;
let alice = "";
let bob = "";

beforeAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: ADMIN } });
  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  await db.user.create({ data: { id: ADMIN, email: `${ADMIN}@test.local` } });
  await db.organizationMembership.create({ data: { userId: ADMIN, organizationId: ORG } });
  await assignRole({
    userId: ADMIN,
    roleId: ADMIN_BUILTIN_ID,
    organizationId: ORG,
    grantedById: null,
  });

  people = await createDataModel({
    organizationId: ORG,
    key: "people",
    name: "People",
    createdBy: ADMIN,
  });
  const aliceRec = await createDataRecord({
    dataModelId: people.id,
    data: { title: "Alice" },
    createdBy: ADMIN,
  });
  const bobRec = await createDataRecord({
    dataModelId: people.id,
    data: { title: "Bob" },
    createdBy: ADMIN,
  });
  alice = aliceRec.id;
  bob = bobRec.id;

  issues = await createDataModel({
    organizationId: ORG,
    key: "issues",
    name: "Issues",
    createdBy: ADMIN,
  });
  await createDataField({
    dataModelId: issues.id,
    key: "assignee",
    label: "Assignee",
    type: "RELATION",
    config: { relationTarget: "people", relationTargetKind: "DATA_MODEL", cardinality: "ONE" },
  });
  await createDataField({
    dataModelId: issues.id,
    key: "reviewers",
    label: "Reviewers",
    type: "RELATION",
    config: { relationTarget: "people", relationTargetKind: "DATA_MODEL", cardinality: "MANY" },
  });

  await createDataRecord({
    dataModelId: issues.id,
    data: { title: "I1", assignee: alice, reviewers: [alice, bob] },
    createdBy: ADMIN,
  });
  await createDataRecord({
    dataModelId: issues.id,
    data: { title: "I2", assignee: bob, reviewers: [bob] },
    createdBy: ADMIN,
  });
  await createDataRecord({
    dataModelId: issues.id,
    data: { title: "I3", assignee: null, reviewers: [] },
    createdBy: ADMIN,
  });
});

afterAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: ADMIN } });
});

// Data-layer run with manually-built targets (roleAccess = TRUE), to isolate
// the compiler's traversal SQL.
async function titlesData(filter: FilterNode): Promise<string[]> {
  const peopleFields = buildCompileFields(await listDataFields(people.id));
  const targets: RelationTargets = new Map([
    ["assignee", { dataModelId: people.id, fields: peopleFields, roleAccess: Prisma.sql`TRUE` }],
    ["reviewers", { dataModelId: people.id, fields: peopleFields, roleAccess: Prisma.sql`TRUE` }],
  ]);
  const page = await listDataRecordsWithQuery({
    dataModelId: issues.id,
    filter,
    fields: buildCompileFields(await listDataFields(issues.id)),
    relationTargets: targets,
    bypassRoleAccess: true,
  });
  return page.items.map((r) => r.title).sort();
}

describe("compiler traversal", () => {
  it("scalar (ONE) relation : assignee.title", async () => {
    expect(await titlesData(leaf("assignee.title", "contains", "alice"))).toEqual(["I1"]);
    expect(await titlesData(leaf("assignee.title", "is", "bob"))).toEqual(["I2"]);
    expect(await titlesData(leaf("assignee.title", "contains", "zzz"))).toEqual([]);
  });

  it("array (MANY) relation : reviewers.title", async () => {
    // Alice reviews only I1 ; Bob reviews I1 + I2.
    expect(await titlesData(leaf("reviewers.title", "contains", "alice"))).toEqual(["I1"]);
    expect(await titlesData(leaf("reviewers.title", "contains", "bob"))).toEqual(["I1", "I2"]);
  });

  it("composes with a normal condition", async () => {
    const q: FilterNode = {
      kind: "group",
      combinator: "and",
      children: [leaf("assignee.title", "contains", "o"), leaf("title", "is", "I2")],
    };
    expect(await titlesData(q)).toEqual(["I2"]);
  });

  it("rejects traversing a non-relation field", async () => {
    await expect(titlesData(leaf("title.foo", "is", "x"))).rejects.toThrow();
  });

  it("rejects more than one level", async () => {
    await expect(titlesData(leaf("assignee.manager.title", "is", "x"))).rejects.toThrow();
  });
});

describe("router traversal (resolves targets)", () => {
  const createCaller = t.createCallerFactory(dataModelsRouter);
  const admin = () => createCaller({ userId: ADMIN, activeOrganizationId: ORG, requestId: "trav" });

  it("resolves the target model + filters through the relation", async () => {
    const res = await admin().records.list({
      dataModelId: issues.id,
      filter: leaf("assignee.title", "contains", "alice"),
    });
    expect(res.items.map((r) => r.title)).toEqual(["I1"]);
  });
});
