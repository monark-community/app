import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import {
  archiveDataField,
  createDataField,
  createDataModel,
  findFreeDataFieldKey,
  findFreeDataModelKey,
  listDataFields,
  listDataModels,
  reorderDataFields,
  restoreDataModel,
  softDeleteDataModel,
  unarchiveDataField,
} from "../../src/server/data";

// Integration tests for the DataModel/DataField data layer against a real
// Postgres testcontainer. These lock in the two hand-written partial-unique
// indexes added in the 20260706000312_add_data_models migration (Prisma's
// `@@unique` can't express a NULL-aware WHERE) : a platform-wide key
// namespace independent of any org's own key namespace.

const ORG_A = "dm-org-a";
const ORG_B = "dm-org-b";
const ACTOR = "dm-actor";

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
  await db.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
  await db.user.deleteMany({ where: { id: ACTOR } });
});

describe("DataModel key uniqueness — partial indexes", () => {
  it("rejects a second platform-wide model with the same key", async () => {
    await createDataModel({
      organizationId: null,
      key: "industry",
      name: "Industry",
      createdBy: ACTOR,
    });
    await expect(
      createDataModel({
        organizationId: null,
        key: "industry",
        name: "Industry Again",
        createdBy: ACTOR,
      }),
    ).rejects.toThrow();
  });

  it("allows two different orgs to reuse the same model key", async () => {
    await createDataModel({
      organizationId: ORG_A,
      key: "project",
      name: "Project",
      createdBy: ACTOR,
    });
    // Should NOT throw — org-scoped keys are namespaced per org.
    await expect(
      createDataModel({ organizationId: ORG_B, key: "project", name: "Project", createdBy: ACTOR }),
    ).resolves.toBeTruthy();
  });

  it("rejects a duplicate key within the same org", async () => {
    await createDataModel({
      organizationId: ORG_A,
      key: "project",
      name: "Project",
      createdBy: ACTOR,
    });
    await expect(
      createDataModel({
        organizationId: ORG_A,
        key: "project",
        name: "Project 2",
        createdBy: ACTOR,
      }),
    ).rejects.toThrow();
  });

  it("findFreeDataModelKey appends a numeric suffix on collision, scoped correctly", async () => {
    await createDataModel({ organizationId: ORG_A, key: "notes", name: "Notes", createdBy: ACTOR });
    const free = await findFreeDataModelKey(ORG_A, "Notes");
    expect(free).toBe("notes-2");
    // A different org's namespace is untouched by ORG_A's collision.
    const freeOtherOrg = await findFreeDataModelKey(ORG_B, "Notes");
    expect(freeOtherOrg).toBe("notes");
  });
});

describe("DataModel soft delete / restore", () => {
  it("a soft-deleted model no longer collides on key, and restore re-blocks it", async () => {
    const model = await createDataModel({
      organizationId: ORG_A,
      key: "archive-me",
      name: "Archive Me",
      createdBy: ACTOR,
    });
    await softDeleteDataModel(model.id);
    // Free again once soft-deleted (partial index filters deletedAt IS NULL).
    await expect(
      createDataModel({
        organizationId: ORG_A,
        key: "archive-me",
        name: "Reborn",
        createdBy: ACTOR,
      }),
    ).resolves.toBeTruthy();
  });
});

describe("listDataModels — org-scoped + platform-wide union", () => {
  it("returns the caller's org models plus every platform-wide model, never another org's", async () => {
    await createDataModel({
      organizationId: null,
      key: "industry",
      name: "Industry",
      createdBy: ACTOR,
    });
    await createDataModel({
      organizationId: ORG_A,
      key: "project",
      name: "Project",
      createdBy: ACTOR,
    });
    await createDataModel({
      organizationId: ORG_B,
      key: "other-project",
      name: "Other",
      createdBy: ACTOR,
    });

    const page = await listDataModels({ organizationId: ORG_A });
    const keys = page.items.map((m) => m.key).sort();
    expect(keys).toEqual(["industry", "project"]);
  });
});

describe("DataField CRUD", () => {
  it("creates a field with a validated config and rejects a malformed one", async () => {
    const model = await createDataModel({
      organizationId: ORG_A,
      key: "widgets",
      name: "Widgets",
      createdBy: ACTOR,
    });
    const field = await createDataField({
      dataModelId: model.id,
      key: "status",
      label: "Status",
      type: "SELECT",
      config: { options: [{ value: "open", label: "Open" }] },
    });
    expect(field.type).toBe("SELECT");

    await expect(
      createDataField({
        dataModelId: model.id,
        key: "bad_status",
        label: "Bad Status",
        type: "SELECT",
        // SELECT requires a non-empty `options` array.
        config: {},
      }),
    ).rejects.toThrow();
  });

  it("findFreeDataFieldKey derives a snake_case key and dedupes within the model", async () => {
    const model = await createDataModel({
      organizationId: ORG_A,
      key: "widgets-2",
      name: "Widgets 2",
      createdBy: ACTOR,
    });
    await createDataField({
      dataModelId: model.id,
      key: await findFreeDataFieldKey(model.id, "Launch Date"),
      label: "Launch Date",
      type: "DATE",
      config: {},
    });
    const second = await findFreeDataFieldKey(model.id, "Launch Date");
    expect(second).toBe("launch_date_2");
  });

  it("reorders fields and archive/unarchive round-trips", async () => {
    const model = await createDataModel({
      organizationId: ORG_A,
      key: "tasks",
      name: "Tasks",
      createdBy: ACTOR,
    });
    const a = await createDataField({
      dataModelId: model.id,
      key: "a_field",
      label: "A",
      type: "TEXT",
      config: {},
    });
    const b = await createDataField({
      dataModelId: model.id,
      key: "b_field",
      label: "B",
      type: "TEXT",
      config: {},
    });

    await reorderDataFields(model.id, [b.id, a.id]);
    const reordered = await listDataFields(model.id);
    expect(reordered.map((f) => f.id)).toEqual([b.id, a.id]);

    await archiveDataField(a.id);
    const activeOnly = await listDataFields(model.id);
    expect(activeOnly.map((f) => f.id)).toEqual([b.id]);

    await unarchiveDataField(a.id);
    const restored = await listDataFields(model.id);
    expect(restored.map((f) => f.id).sort()).toEqual([a.id, b.id].sort());
  });
});
