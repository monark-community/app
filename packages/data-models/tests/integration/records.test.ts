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
  updateDataModel,
  updateDataRecord,
} from "../../src/server/data";

// Integration tests for DataRecord CRUD — dynamic value validation (shared
// with the client via `valueSchemaForField`), title derivation from the
// model's title field, and slug uniqueness, against a real Postgres
// testcontainer.

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
  const model = await createDataModel({
    organizationId: ORG_A,
    key: "tasks",
    name: "Tasks",
    createdBy: ACTOR,
  });
  const title = await createDataField({
    dataModelId: model.id,
    key: "title",
    label: "Title",
    type: "TEXT",
    config: { maxLength: 120 },
    required: true,
  });
  await createDataField({
    dataModelId: model.id,
    key: "done",
    label: "Done",
    type: "BOOLEAN",
    config: {},
  });
  await updateDataModel(model.id, { titleFieldId: title.id });
  return { model, title };
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

  it("falls back to 'Untitled' when the model has no title field configured", async () => {
    const model = await createDataModel({
      organizationId: ORG_A,
      key: "no-title",
      name: "No Title",
      createdBy: ACTOR,
    });
    await createDataField({
      dataModelId: model.id,
      key: "note",
      label: "Note",
      type: "LONG_TEXT",
      config: {},
    });
    const record = await createDataRecord({
      dataModelId: model.id,
      data: { note: "hello" },
      createdBy: ACTOR,
    });
    expect(record.title).toBe("Untitled");
  });

  it("strips HTML when the title field is RICH_TEXT", async () => {
    const model = await createDataModel({
      organizationId: ORG_A,
      key: "notes",
      name: "Notes",
      createdBy: ACTOR,
    });
    const body = await createDataField({
      dataModelId: model.id,
      key: "body",
      label: "Body",
      type: "RICH_TEXT",
      config: {},
    });
    await updateDataModel(model.id, { titleFieldId: body.id });
    const record = await createDataRecord({
      dataModelId: model.id,
      data: { body: "<p>Hello <strong>world</strong></p>" },
      createdBy: ACTOR,
    });
    expect(record.title).toBe("Hello world");
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
