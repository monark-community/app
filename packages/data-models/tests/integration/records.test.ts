import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import {
  createDataField,
  createDataModel,
  createDataRecord,
  findFreeDataRecordSlug,
  hardDeleteDataRecord,
  listDataRecords,
  restoreDataRecord,
  softDeleteDataRecord,
  updateDataRecord,
} from "../../src/server/data";

// Integration tests for DataRecord CRUD — dynamic value validation (shared
// with the client via `valueSchemaForField`), title derivation from the
// model's reserved `title` field (auto-created with every model), and slug
// uniqueness, against a real Postgres testcontainer.

const ORG_A = "dm-rec-org-a";
const ACTOR = "dm-rec-actor";

beforeAll(async () => {
  const db = getDb();
  await db.organization.upsert({
    where: { id: ORG_A },
    create: { id: ORG_A, slug: ORG_A, displayName: ORG_A },
    update: {},
  });
  await db.user.upsert({
    where: { id: ACTOR },
    create: { id: ACTOR, email: `${ACTOR}@test.local` },
    update: {},
  });
});

afterEach(async () => {
  await truncate(getDb(), [
    "DataFieldIndex",
    "DataModelIntegration",
    "DataRecord",
    "DataField",
    "DataModel",
  ]);
});

afterAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG_A } });
  await db.user.deleteMany({ where: { id: ACTOR } });
});

async function seedTaskModel() {
  // The reserved required TEXT `title` field is auto-created with the model.
  const model = await createDataModel({
    organizationId: ORG_A,
    key: "tasks",
    name: "Tasks",
    createdBy: ACTOR,
  });
  await createDataField({
    dataModelId: model.id,
    key: "done",
    label: "Done",
    type: "BOOLEAN",
    config: {},
  });
  return { model };
}

describe("createDataRecord — validation + title derivation", () => {
  it("validates data against active fields and derives the title", async () => {
    const { model } = await seedTaskModel();
    const record = await createDataRecord({
      dataModelId: model.id,
      data: { title: "Ship the thing", done: false },
      createdBy: ACTOR,
    });
    expect(record.title).toBe("Ship the thing");
    expect(record.organizationId).toBe(ORG_A);
    expect(record.data).toEqual({ title: "Ship the thing", done: false });
  });

  it("rejects a payload missing a required field", async () => {
    const { model } = await seedTaskModel();
    await expect(
      createDataRecord({ dataModelId: model.id, data: { done: false }, createdBy: ACTOR }),
    ).rejects.toThrow();
  });

  it("strips keys that don't correspond to an active field", async () => {
    const { model } = await seedTaskModel();
    const record = await createDataRecord({
      dataModelId: model.id,
      data: { title: "Valid", done: true, notAField: "should be dropped" },
      createdBy: ACTOR,
    });
    expect(record.data).toEqual({ title: "Valid", done: true });
  });

  it("derives 'Untitled' when the title value is blank", async () => {
    // The title field is required (min length 1), so a whitespace-only value
    // passes validation but derives to the "Untitled" display fallback.
    const { model } = await seedTaskModel();
    const record = await createDataRecord({
      dataModelId: model.id,
      data: { title: "   ", done: false },
      createdBy: ACTOR,
    });
    expect(record.title).toBe("Untitled");
  });
});

describe("updateDataRecord — partial merge + re-validation", () => {
  it("merges only the provided keys and keeps the rest, recomputing the title", async () => {
    const { model } = await seedTaskModel();
    const record = await createDataRecord({
      dataModelId: model.id,
      data: { title: "Original", done: false },
      createdBy: ACTOR,
    });
    const updated = await updateDataRecord(record.id, { data: { done: true } });
    expect(updated.data).toEqual({ title: "Original", done: true });
    expect(updated.title).toBe("Original");

    const retitled = await updateDataRecord(record.id, { data: { title: "Renamed" } });
    expect(retitled.data).toEqual({ title: "Renamed", done: true });
    expect(retitled.title).toBe("Renamed");
  });

  it("rejects a merged payload that would violate a required field's constraint", async () => {
    const { model } = await seedTaskModel();
    const record = await createDataRecord({
      dataModelId: model.id,
      data: { title: "Original", done: false },
      createdBy: ACTOR,
    });
    await expect(updateDataRecord(record.id, { data: { title: "" } })).rejects.toThrow();
  });
});

describe("DataRecord slug", () => {
  it("findFreeDataRecordSlug dedupes within the model", async () => {
    const { model } = await seedTaskModel();
    await createDataRecord({
      dataModelId: model.id,
      slug: "launch",
      data: { title: "Launch", done: false },
      createdBy: ACTOR,
    });
    const free = await findFreeDataRecordSlug(model.id, "Launch");
    expect(free).toBe("launch-2");
  });
});

describe("listDataRecords — search + soft delete", () => {
  it("filters by search across title and slug, excludes soft-deleted by default", async () => {
    const { model } = await seedTaskModel();
    const a = await createDataRecord({
      dataModelId: model.id,
      data: { title: "Alpha task", done: false },
      createdBy: ACTOR,
    });
    await createDataRecord({
      dataModelId: model.id,
      data: { title: "Beta task", done: false },
      createdBy: ACTOR,
    });

    const filtered = await listDataRecords({ dataModelId: model.id, search: "Alpha" });
    expect(filtered.items.map((r) => r.id)).toEqual([a.id]);

    await softDeleteDataRecord(a.id);
    const afterDelete = await listDataRecords({ dataModelId: model.id });
    expect(afterDelete.items.map((r) => r.title)).toEqual(["Beta task"]);

    await restoreDataRecord(a.id);
    const afterRestore = await listDataRecords({ dataModelId: model.id });
    expect(afterRestore.items.length).toBe(2);

    await hardDeleteDataRecord(a.id);
    const afterHardDelete = await listDataRecords({ dataModelId: model.id, includeDeleted: true });
    expect(afterHardDelete.items.map((r) => r.title)).toEqual(["Beta task"]);
  });
});

describe("listDataRecords — per-field filters", () => {
  // A model exercising every filterable value encoding : text, number,
  // boolean, single-select, multi-select (stored as string[]).
  async function seedIssueModel() {
    const model = await createDataModel({
      organizationId: ORG_A,
      key: "issues",
      name: "Issues",
      createdBy: ACTOR,
    });
    await createDataField({
      dataModelId: model.id,
      key: "done",
      label: "Done",
      type: "BOOLEAN",
      config: {},
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
      key: "status",
      label: "Status",
      type: "SELECT",
      config: {
        options: [
          { value: "open", label: "Open" },
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
          { value: "bug", label: "Bug" },
          { value: "ux", label: "UX" },
          { value: "perf", label: "Perf" },
        ],
      },
    });
    return model;
  }

  async function seedIssues(modelId: string) {
    const mk = (data: Record<string, unknown>) =>
      createDataRecord({ dataModelId: modelId, data, createdBy: ACTOR });
    await mk({ title: "Login bug", done: false, priority: 1, status: "open", tags: ["bug", "ux"] });
    await mk({ title: "Slow page", done: true, priority: 3, status: "closed", tags: ["perf"] });
    await mk({ title: "Crash on save", done: false, priority: 1, status: "open", tags: ["bug"] });
  }

  const titlesOf = (r: { items: { title: string }[] }) => r.items.map((x) => x.title).sort();

  it("filters text (contains), number (equals), and boolean (equals)", async () => {
    const model = await seedIssueModel();
    await seedIssues(model.id);

    const byText = await listDataRecords({
      dataModelId: model.id,
      fieldFilters: [{ key: "title", type: "text", value: "bug" }],
    });
    expect(titlesOf(byText)).toEqual(["Login bug"]);

    const byNumber = await listDataRecords({
      dataModelId: model.id,
      fieldFilters: [{ key: "priority", type: "number", value: "1" }],
    });
    expect(titlesOf(byNumber)).toEqual(["Crash on save", "Login bug"]);

    const byBool = await listDataRecords({
      dataModelId: model.id,
      fieldFilters: [{ key: "done", type: "boolean", value: "true" }],
    });
    expect(titlesOf(byBool)).toEqual(["Slow page"]);
  });

  it("filters single-select (equals + any-of) and multi-select (contains any)", async () => {
    const model = await seedIssueModel();
    await seedIssues(model.id);

    const byStatus = await listDataRecords({
      dataModelId: model.id,
      fieldFilters: [{ key: "status", type: "select", value: "closed" }],
    });
    expect(titlesOf(byStatus)).toEqual(["Slow page"]);

    // `selectAny` — a scalar single-select matched against one OR more values.
    const oneStatus = await listDataRecords({
      dataModelId: model.id,
      fieldFilters: [{ key: "status", type: "selectAny", value: ["open"] }],
    });
    expect(titlesOf(oneStatus)).toEqual(["Crash on save", "Login bug"]);

    const eitherStatus = await listDataRecords({
      dataModelId: model.id,
      fieldFilters: [{ key: "status", type: "selectAny", value: ["open", "closed"] }],
    });
    expect(titlesOf(eitherStatus)).toEqual(["Crash on save", "Login bug", "Slow page"]);

    const byTag = await listDataRecords({
      dataModelId: model.id,
      fieldFilters: [{ key: "tags", type: "multiSelect", value: ["bug"] }],
    });
    expect(titlesOf(byTag)).toEqual(["Crash on save", "Login bug"]);

    // "any of" — perf (Slow page) OR ux (Login bug)
    const byTagsAny = await listDataRecords({
      dataModelId: model.id,
      fieldFilters: [{ key: "tags", type: "multiSelect", value: ["perf", "ux"] }],
    });
    expect(titlesOf(byTagsAny)).toEqual(["Login bug", "Slow page"]);
  });

  it("ANDs multiple field filters together and ignores neutral values", async () => {
    const model = await seedIssueModel();
    await seedIssues(model.id);

    const both = await listDataRecords({
      dataModelId: model.id,
      fieldFilters: [
        { key: "status", type: "select", value: "open" },
        { key: "priority", type: "number", value: "1" },
      ],
    });
    expect(titlesOf(both)).toEqual(["Crash on save", "Login bug"]);

    // No open record is tagged perf → empty.
    const contradiction = await listDataRecords({
      dataModelId: model.id,
      fieldFilters: [
        { key: "status", type: "select", value: "open" },
        { key: "tags", type: "multiSelect", value: ["perf"] },
      ],
    });
    expect(contradiction.items).toEqual([]);

    // Empty / non-numeric values compose out, so the list is unfiltered.
    const neutral = await listDataRecords({
      dataModelId: model.id,
      fieldFilters: [
        { key: "title", type: "text", value: "   " },
        { key: "priority", type: "number", value: "" },
        { key: "tags", type: "multiSelect", value: [] },
      ],
    });
    expect(neutral.items.length).toBe(3);
  });
});
