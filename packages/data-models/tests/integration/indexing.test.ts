import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import {
  createDataField,
  createDataModel,
  createDataRecord,
  findDataFieldById,
  type DataFieldRow,
} from "../../src/server/data";
import { getFieldIndexStatus, requestFieldIndex } from "../../src/server/indexing";

// Integration tests for the per-field expression-indexing provisioner
// against a real Postgres testcontainer — the only way to meaningfully
// verify `CREATE INDEX CONCURRENTLY` DDL and the resulting index actually
// works, since none of this can be exercised with a mocked client.

const ORG_A = "dm-idx-org-a";
const ACTOR = "dm-idx-actor";

beforeAll(async () => {
  await getDb().organization.upsert({
    where: { id: ORG_A },
    create: { id: ORG_A, slug: ORG_A, displayName: ORG_A },
    update: {},
  });
});

afterEach(async () => {
  // Drop any indexes this suite created before truncating, so a re-run
  // (or another test file's DataField ids) never collides on index name.
  const db = getDb();
  const rows = await db.dataFieldIndex.findMany({ select: { indexName: true } });
  for (const row of rows) {
    await db.$executeRawUnsafe(`DROP INDEX CONCURRENTLY IF EXISTS "${row.indexName}"`);
  }
  await truncate(db, [
    "DataFieldIndex",
    "DataModelIntegration",
    "DataRecord",
    "DataField",
    "DataModel",
  ]);
});

afterAll(async () => {
  await getDb().organization.deleteMany({ where: { id: ORG_A } });
});

async function waitForStatus(
  fieldId: string,
  target: "ready" | "failed",
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getFieldIndexStatus(fieldId);
    if (status === target) return;
    if (status === "failed" && target === "ready") {
      throw new Error("index build failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for index status "${target}"`);
}

async function indexDefFor(indexName: string): Promise<string | null> {
  const rows = await getDb().$queryRawUnsafe<Array<{ indexdef: string }>>(
    `SELECT indexdef FROM pg_indexes WHERE indexname = '${indexName}'`,
  );
  return rows[0]?.indexdef ?? null;
}

async function seedModelWithField(
  type: "NUMBER" | "BOOLEAN" | "DATE" | "TEXT" | "MULTI_SELECT",
  config: unknown = {},
): Promise<{ modelId: string; field: DataFieldRow }> {
  const model = await createDataModel({
    organizationId: ORG_A,
    key: `idx-${type.toLowerCase()}`,
    name: `Index ${type}`,
    createdBy: ACTOR,
  });
  const field = await createDataField({
    dataModelId: model.id,
    key: "value",
    label: "Value",
    type,
    config,
  });
  return { modelId: model.id, field };
}

describe("requestFieldIndex — provisioning", () => {
  it("provisions a B-tree index for a NUMBER field and flips DataField.indexed", async () => {
    const { field } = await seedModelWithField("NUMBER");
    const result = await requestFieldIndex(field);
    expect(result.status).toBe("pending");

    await waitForStatus(field.id, "ready");
    const updatedField = await findDataFieldById(field.id);
    expect(updatedField?.indexed).toBe(true);

    const def = await indexDefFor(result.indexName);
    expect(def).toContain("USING btree");
    expect(def).toContain("((data ->> 'value'::text))::numeric");
  });

  it("provisions a GIN index for a MULTI_SELECT field", async () => {
    const { field } = await seedModelWithField("MULTI_SELECT", {
      options: [{ value: "a", label: "A" }],
    });
    const result = await requestFieldIndex(field);
    await waitForStatus(field.id, "ready");

    const def = await indexDefFor(result.indexName);
    expect(def).toContain("USING gin");
  });

  it("is idempotent : a second request while ready/pending short-circuits without re-issuing DDL", async () => {
    const { field } = await seedModelWithField("BOOLEAN");
    const first = await requestFieldIndex(field);
    await waitForStatus(field.id, "ready");

    const second = await requestFieldIndex(field);
    expect(second.status).toBe("ready");
    expect(second.indexName).toBe(first.indexName);

    const rows = await getDb().dataFieldIndex.findMany({ where: { dataFieldId: field.id } });
    expect(rows.length).toBe(1);
  });

  it("the resulting index expression actually filters correctly (NUMBER cast)", async () => {
    const { modelId, field } = await seedModelWithField("NUMBER");
    // The reserved `title` field is auto-created with the model.
    await createDataRecord({
      dataModelId: modelId,
      data: { title: "Low", value: 3 },
      createdBy: ACTOR,
    });
    await createDataRecord({
      dataModelId: modelId,
      data: { title: "High", value: 99 },
      createdBy: ACTOR,
    });

    await requestFieldIndex(field);
    await waitForStatus(field.id, "ready");

    // Query `data->>'title'` directly ; this asserts the JSONB value the
    // expression index reads, independent of the denormalized `title` column.
    const matches = await getDb().$queryRawUnsafe<Array<{ title: string }>>(
      `SELECT data->>'title' AS title FROM "DataRecord" WHERE "dataModelId" = '${modelId}' AND ((data->>'value')::numeric) > 50`,
    );
    expect(matches.map((r) => r.title)).toEqual(["High"]);
  });
});
