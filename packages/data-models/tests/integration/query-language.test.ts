import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import {
  buildCompileFields,
  createDataField,
  createDataModel,
  createDataRecord,
  listDataFields,
  listDataRecordsWithQuery,
  type DataModelRow,
} from "../../src/server/data";
import { group, leaf, type FilterNode } from "../../src/contracts/query";

// End-to-end coverage for the structured query language (MonarkQL) : the
// `FilterNode` tree compiled to raw SQL by `query-compiler.ts` and run through
// `listDataRecordsWithQuery` against a real Postgres testcontainer. Exercises
// each operator family (text ILIKE, number/date comparison, set membership,
// presence), boolean groups, negation, and the keyset pagination contract.

const ORG = "dm-ql-org";
const ACTOR = "dm-ql-actor";

let model: DataModelRow;

beforeAll(async () => {
  const db = getDb();
  await db.organization.upsert({
    where: { id: ORG },
    create: { id: ORG, slug: ORG, displayName: ORG },
    update: {},
  });
  await db.user.upsert({
    where: { id: ACTOR },
    create: { id: ACTOR, email: `${ACTOR}@test.local` },
    update: {},
  });
  await truncate(db, ["DataRecord", "DataField", "DataModel"]);

  model = await createDataModel({
    organizationId: ORG,
    key: "issues",
    name: "Issues",
    createdBy: ACTOR,
  });
  await createDataField({
    dataModelId: model.id,
    key: "status",
    label: "Status",
    type: "SELECT",
    config: {
      options: [
        { value: "open", label: "Open" },
        { value: "in_progress", label: "In progress" },
        { value: "closed", label: "Closed" },
      ],
    },
  });
  await createDataField({
    dataModelId: model.id,
    key: "tags",
    label: "Tags",
    type: "MULTI_SELECT",
    config: {
      options: [
        { value: "red", label: "Red" },
        { value: "blue", label: "Blue" },
        { value: "green", label: "Green" },
      ],
    },
  });
  await createDataField({
    dataModelId: model.id,
    key: "priority",
    label: "Priority",
    type: "NUMBER",
    config: {},
  });
  await createDataField({
    dataModelId: model.id,
    key: "due",
    label: "Due",
    type: "DATE",
    config: {},
  });
  await createDataField({
    dataModelId: model.id,
    key: "done",
    label: "Done",
    type: "BOOLEAN",
    config: {},
  });

  const rows = [
    {
      title: "Alpha",
      status: "open",
      tags: ["red", "blue"],
      priority: 2,
      due: new Date("2026-01-10"),
      done: false,
    },
    {
      title: "Beta",
      status: "closed",
      tags: ["blue"],
      priority: 5,
      due: new Date("2026-03-15"),
      done: true,
    },
    {
      title: "Gamma",
      status: "open",
      tags: [],
      priority: 8,
      due: new Date("2026-06-01"),
      done: false,
    },
    {
      title: "delta",
      status: "in_progress",
      tags: ["green"],
      priority: null,
      due: null,
      done: false,
    },
  ];
  for (const data of rows) {
    await createDataRecord({ dataModelId: model.id, data, createdBy: ACTOR });
  }
});

afterAll(async () => {
  const db = getDb();
  await truncate(db, ["DataRecord", "DataField", "DataModel"]);
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: ACTOR } });
});

/** Run a query tree and return the matching record titles, sorted for stable
 *  assertions. */
async function titles(
  filter: FilterNode,
  opts?: { limit?: number; cursor?: string | null; now?: Date },
): Promise<string[]> {
  const fields = await listDataFields(model.id);
  const page = await listDataRecordsWithQuery({
    dataModelId: model.id,
    filter,
    fields: buildCompileFields(fields),
    queryContext: { userId: ACTOR, now: opts?.now ?? new Date() },
    bypassRoleAccess: true,
    limit: opts?.limit,
    cursor: opts?.cursor,
  });
  return page.items.map((r) => r.title).sort();
}

describe("text operators (case-insensitive)", () => {
  it("contains matches regardless of case", async () => {
    expect(await titles(leaf("title", "contains", "ALPHA"))).toEqual(["Alpha"]);
    expect(await titles(leaf("title", "contains", "DELTA"))).toEqual(["delta"]);
  });
  it("is matches the whole value, case-insensitively", async () => {
    expect(await titles(leaf("title", "is", "alpha"))).toEqual(["Alpha"]);
  });
  it("startsWith / endsWith", async () => {
    expect(await titles(leaf("title", "startsWith", "de"))).toEqual(["delta"]);
    expect(await titles(leaf("title", "endsWith", "a"))).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
      "delta",
    ]);
  });
});

describe("number operators", () => {
  it("gt / between exclude the null-priority record", async () => {
    expect(await titles(leaf("priority", "gt", "4"))).toEqual(["Beta", "Gamma"]);
    expect(await titles(leaf("priority", "between", ["2", "5"]))).toEqual(["Alpha", "Beta"]);
  });
  it("isEmpty finds the null-priority record", async () => {
    expect(await titles(leaf("priority", "isEmpty"))).toEqual(["delta"]);
  });
});

describe("date operators", () => {
  it("before compares chronologically", async () => {
    expect(await titles(leaf("due", "before", "2026-04-01"))).toEqual(["Alpha", "Beta"]);
  });
});

describe("boolean operators", () => {
  it("isTrue", async () => {
    expect(await titles(leaf("done", "isTrue"))).toEqual(["Beta"]);
  });
});

describe("select / multi-select membership", () => {
  it("select isAnyOf / isNoneOf", async () => {
    expect(await titles(leaf("status", "isAnyOf", ["open"]))).toEqual(["Alpha", "Gamma"]);
    expect(await titles(leaf("status", "isNoneOf", ["open"]))).toEqual(["Beta", "delta"]);
  });
  it("multi-select hasAnyOf / hasAllOf / isEmpty", async () => {
    expect(await titles(leaf("tags", "hasAnyOf", ["blue"]))).toEqual(["Alpha", "Beta"]);
    expect(await titles(leaf("tags", "hasAllOf", ["red", "blue"]))).toEqual(["Alpha"]);
    expect(await titles(leaf("tags", "isEmpty"))).toEqual(["Gamma"]);
  });
});

describe("boolean groups + negation", () => {
  it("AND narrows", async () => {
    const q = group("and", [leaf("status", "isAnyOf", ["open"]), leaf("priority", "gt", "5")]);
    expect(await titles(q)).toEqual(["Gamma"]);
  });
  it("OR widens", async () => {
    const q = group("or", [leaf("priority", "lt", "3"), leaf("done", "isTrue")]);
    expect(await titles(q)).toEqual(["Alpha", "Beta"]);
  });
  it("a negated group excludes its matches", async () => {
    const q = group("and", [leaf("status", "isAnyOf", ["open"])], true);
    expect(await titles(q)).toEqual(["Beta", "delta"]);
  });
});

describe("dynamic variables", () => {
  it("resolves @today against the query context (before / on-or-after)", async () => {
    // now = 2026-04-01 → Alpha (Jan) + Beta (Mar) are before today ; Gamma
    // (Jun) is on-or-after ; delta (null due) is in neither.
    const now = new Date("2026-04-01T00:00:00.000Z");
    expect(await titles(leaf("due", "before", "@today"), { now })).toEqual(["Alpha", "Beta"]);
    expect(await titles(leaf("due", "onOrAfter", "@today"), { now })).toEqual(["Gamma"]);
  });

  it("rejects an unknown variable", async () => {
    await expect(titles(leaf("due", "before", "@whenever"))).rejects.toThrow();
  });
});

describe("unknown field / illegal operator", () => {
  it("rejects an unknown field", async () => {
    await expect(titles(leaf("nope", "is", "x"))).rejects.toThrow();
  });
  it("rejects an operator illegal for the field's type", async () => {
    await expect(titles(leaf("status", "gt", "3"))).rejects.toThrow();
  });
});

describe("keyset pagination contract", () => {
  it("pages through all records with a stable cursor + total", async () => {
    const all = group("and", []); // TRUE — every record
    const fields = buildCompileFields(await listDataFields(model.id));
    const page1 = await listDataRecordsWithQuery({
      dataModelId: model.id,
      filter: all,
      fields,
      bypassRoleAccess: true,
      limit: 2,
    });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(4);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await listDataRecordsWithQuery({
      dataModelId: model.id,
      filter: all,
      fields,
      bypassRoleAccess: true,
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items).toHaveLength(2);
    expect(page2.total).toBe(4);

    const seen = new Set([...page1.items, ...page2.items].map((r) => r.id));
    expect(seen.size).toBe(4); // no overlap across pages
  });
});
