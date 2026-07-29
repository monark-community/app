import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import {
  createDataField,
  createDataModel,
  createDataRecord,
  findDataRecordById,
  listDataFields,
  reorderDataFields,
  updateDataRecord,
} from "../../src/server/data";

// Integration tests for FORMULA fields against a real Postgres testcontainer:
// compute-on-write (result persisted into DataRecord.data), formula-of-formula
// dependency ordering, a formula as the title field, recompute on update, and
// the field-save reference + cycle validation.

const ORG = "dm-formula-org";
const ACTOR = "dm-formula-actor";

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
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: ACTOR } });
});

async function seedInvoiceModel() {
  const model = await createDataModel({
    organizationId: ORG,
    key: "invoices",
    name: "Invoices",
    createdBy: ACTOR,
  });
  await createDataField({
    dataModelId: model.id,
    key: "price",
    label: "Price",
    type: "NUMBER",
    config: {},
  });
  await createDataField({
    dataModelId: model.id,
    key: "quantity",
    label: "Quantity",
    type: "NUMBER",
    config: {},
  });
  return model;
}

describe("FORMULA compute-on-write", () => {
  it("computes and persists a formula's value from sibling fields", async () => {
    const model = await seedInvoiceModel();
    await createDataField({
      dataModelId: model.id,
      key: "subtotal",
      label: "Subtotal",
      type: "FORMULA",
      config: { expression: "price * quantity" },
    });

    const record = await createDataRecord({
      dataModelId: model.id,
      data: { title: "row", price: 10, quantity: 3, subtotal: 999 /* client-supplied, ignored */ },
      createdBy: ACTOR,
    });
    const data = record.data as Record<string, unknown>;
    expect(data.subtotal).toBe(30);
  });

  it("evaluates a formula that references another formula, regardless of field order", async () => {
    const model = await seedInvoiceModel();
    // Create in valid order (a formula can only reference an existing field)...
    const subtotal = await createDataField({
      dataModelId: model.id,
      key: "subtotal",
      label: "Subtotal",
      type: "FORMULA",
      config: { expression: "price * quantity" },
    });
    const total = await createDataField({
      dataModelId: model.id,
      key: "total",
      label: "Total",
      type: "FORMULA",
      config: { expression: "round(subtotal * 1.15, 2)" },
    });
    // ...then position `total` BEFORE `subtotal`, so compute must topologically
    // sort by dependency rather than trust position order.
    const rest = (await listDataFields(model.id))
      .filter((f) => f.key !== "subtotal" && f.key !== "total")
      .map((f) => f.id);
    await reorderDataFields(model.id, [total.id, subtotal.id, ...rest]);

    const record = await createDataRecord({
      dataModelId: model.id,
      data: { title: "row", price: 10, quantity: 2 },
      createdBy: ACTOR,
    });
    const data = record.data as Record<string, unknown>;
    expect(data.subtotal).toBe(20);
    expect(data.total).toBe(23);
  });

  it("backfills existing records when a formula field is added after them", async () => {
    const model = await seedInvoiceModel();
    // A record created BEFORE any formula field exists.
    const record = await createDataRecord({
      dataModelId: model.id,
      data: { title: "row", price: 10, quantity: 4 },
      createdBy: ACTOR,
    });
    expect((record.data as Record<string, unknown>).subtotal).toBeUndefined();

    // Adding the formula field must backfill the existing record's value.
    await createDataField({
      dataModelId: model.id,
      key: "subtotal",
      label: "Subtotal",
      type: "FORMULA",
      config: { expression: "price * quantity" },
    });
    const reloaded = await findDataRecordById(record.id);
    expect((reloaded?.data as Record<string, unknown>).subtotal).toBe(40);
  });

  it("re-backfills every record when a formula's expression changes", async () => {
    const model = await seedInvoiceModel();
    const field = await createDataField({
      dataModelId: model.id,
      key: "subtotal",
      label: "Subtotal",
      type: "FORMULA",
      config: { expression: "price * quantity" },
    });
    const record = await createDataRecord({
      dataModelId: model.id,
      data: { title: "row", price: 10, quantity: 4 },
      createdBy: ACTOR,
    });
    expect((record.data as Record<string, unknown>).subtotal).toBe(40);

    const { updateDataField } = await import("../../src/server/data");
    await updateDataField(field.id, { config: { expression: "price * quantity * 2" } });
    const reloaded = await findDataRecordById(record.id);
    expect((reloaded?.data as Record<string, unknown>).subtotal).toBe(80);
  });

  it("recomputes on update when a referenced field changes", async () => {
    const model = await seedInvoiceModel();
    await createDataField({
      dataModelId: model.id,
      key: "subtotal",
      label: "Subtotal",
      type: "FORMULA",
      config: { expression: "price * quantity" },
    });
    const record = await createDataRecord({
      dataModelId: model.id,
      data: { title: "row", price: 10, quantity: 3 },
      createdBy: ACTOR,
    });
    const updated = await updateDataRecord(record.id, { data: { quantity: 5 } });
    expect((updated.data as Record<string, unknown>).subtotal).toBe(50);
  });

  it("computes a text (string-concat) formula on write", async () => {
    const model = await createDataModel({
      organizationId: ORG,
      key: "people",
      name: "People",
      createdBy: ACTOR,
    });
    await createDataField({
      dataModelId: model.id,
      key: "first",
      label: "First",
      type: "TEXT",
      config: {},
    });
    await createDataField({
      dataModelId: model.id,
      key: "last",
      label: "Last",
      type: "TEXT",
      config: {},
    });
    await createDataField({
      dataModelId: model.id,
      key: "full_name",
      label: "Full name",
      type: "FORMULA",
      config: { expression: 'first & " " & last' },
    });

    const record = await createDataRecord({
      dataModelId: model.id,
      data: { title: "Ada L.", first: "Ada", last: "Lovelace" },
      createdBy: ACTOR,
    });
    expect((record.data as Record<string, unknown>).full_name).toBe("Ada Lovelace");
  });
});

describe("FORMULA field validation", () => {
  it("rejects a formula referencing an unknown field", async () => {
    const model = await seedInvoiceModel();
    await expect(
      createDataField({
        dataModelId: model.id,
        key: "bad",
        label: "Bad",
        type: "FORMULA",
        config: { expression: "price * nonexistent" },
      }),
    ).rejects.toThrow(/unknown field/i);
  });

  it("rejects a formula that references itself", async () => {
    const model = await seedInvoiceModel();
    await expect(
      createDataField({
        dataModelId: model.id,
        key: "loop",
        label: "Loop",
        type: "FORMULA",
        config: { expression: "loop + 1" },
      }),
    ).rejects.toThrow(/itself/i);
  });

  it("rejects a formula that would create a reference cycle", async () => {
    const model = await seedInvoiceModel();
    // a := price + 1 (valid), then b := a + 1 (valid), then edit a := b + 1 (cycle).
    const a = await createDataField({
      dataModelId: model.id,
      key: "a",
      label: "A",
      type: "FORMULA",
      config: { expression: "price + 1" },
    });
    await createDataField({
      dataModelId: model.id,
      key: "b",
      label: "B",
      type: "FORMULA",
      config: { expression: "a + 1" },
    });
    const { updateDataField } = await import("../../src/server/data");
    await expect(updateDataField(a.id, { config: { expression: "b + 1" } })).rejects.toThrow(
      /cycle/i,
    );
  });
});
