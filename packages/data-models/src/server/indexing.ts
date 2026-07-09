import { getDb } from "@monark/db";
import type { DataFieldType } from "../contracts/field-types";
import type { DataFieldRow } from "./data";

// Same shape as the immutability guarantee on DataField.key (see the schema
// comment) — re-checked here defensively, since this value gets
// interpolated directly into raw DDL that Postgres has no parameterized
// form for (you can't bind an identifier or a jsonb operand path via `$1`).
// A field's key is only ever set once, through the validated create path,
// so this should never actually trip — it's a belt-and-suspenders check
// against ever reaching this function with an unsafe value.
const SAFE_KEY_RE = /^[a-z][a-z0-9_]*$/;
const SAFE_ID_RE = /^[a-z0-9]+$/i;

export type DataFieldIndexStatus = "pending" | "building" | "ready" | "failed";

function assertSafeIdentifier(value: string, kind: string): void {
  const re = kind === "key" ? SAFE_KEY_RE : SAFE_ID_RE;
  if (!re.test(value)) {
    throw new Error(`refusing to build an index : unsafe ${kind} "${value}"`);
  }
}

// Postgres index identifiers cap at 63 bytes ; a field id (cuid, ~25 chars)
// comfortably fits the "dm_field_<id>" prefix.
function indexNameFor(dataFieldId: string): string {
  return `dm_field_${dataFieldId}_idx`.slice(0, 63);
}

// MULTI_SELECT / RELATION store an array in `data.<key>` — GIN over the
// jsonb array supports containment queries (`@>` / `?`) for "has this
// value" filters. Every scalar type gets a plain B-tree over the extracted
// + cast value, which supports both equality and range filters/sorts.
function usesGin(type: DataFieldType): boolean {
  return type === "MULTI_SELECT" || type === "RELATION";
}

function indexExpression(type: DataFieldType, key: string): string {
  switch (type) {
    case "NUMBER":
      return `((data->>'${key}')::numeric)`;
    case "BOOLEAN":
      return `((data->>'${key}')::boolean)`;
    case "DATE":
    case "DATETIME":
      return `((data->>'${key}')::timestamptz)`;
    case "MULTI_SELECT":
    case "RELATION":
      return `(data->'${key}')`;
    case "TEXT":
    case "LONG_TEXT":
    case "RICH_TEXT":
    case "SELECT":
    case "URL":
    case "EMAIL":
    // A FORMULA stores its computed scalar as text/number/bool/date in JSONB ;
    // a plain text extraction is a safe generic B-tree for equality/sort.
    case "FORMULA":
      return `(data->>'${key}')`;
  }
}

/**
 * Provisions (or reports the status of) an expression index for one field's
 * hot path. Returns immediately with the current/new status ; the actual
 * `CREATE INDEX CONCURRENTLY` runs in the background (fire-and-forget —
 * `CONCURRENTLY` can't run inside a transaction, and can take a while on a
 * large table, so this isn't a request/response-shaped operation). Callers
 * poll `getFieldIndexStatus` / `DataField.indexed` to know when it lands.
 *
 * Idempotent : a field that's already `pending`/`building`/`ready` short-
 * circuits without re-issuing the DDL ; `CREATE INDEX CONCURRENTLY IF NOT
 * EXISTS` covers the remaining race (two near-simultaneous requests).
 */
export async function requestFieldIndex(
  field: DataFieldRow,
): Promise<{ status: DataFieldIndexStatus; indexName: string }> {
  assertSafeIdentifier(field.key, "key");
  assertSafeIdentifier(field.dataModelId, "id");
  assertSafeIdentifier(field.id, "id");

  const db = getDb();
  const indexName = indexNameFor(field.id);
  const existing = await db.dataFieldIndex.findUnique({ where: { dataFieldId: field.id } });
  if (existing && existing.status !== "failed") {
    return { status: existing.status as DataFieldIndexStatus, indexName: existing.indexName };
  }

  await db.dataFieldIndex.upsert({
    where: { dataFieldId: field.id },
    create: { dataFieldId: field.id, indexName, status: "pending" },
    update: { indexName, status: "pending" },
  });

  void buildIndex(field, indexName).catch(() => {
    // buildIndex already records "failed" on its own catch ; this outer
    // catch exists only so a rejected fire-and-forget promise doesn't
    // surface as an unhandled rejection.
  });

  return { status: "pending", indexName };
}

async function buildIndex(field: DataFieldRow, indexName: string): Promise<void> {
  const db = getDb();
  await db.dataFieldIndex.update({
    where: { dataFieldId: field.id },
    data: { status: "building" },
  });
  try {
    const type = field.type as DataFieldType;
    const expression = indexExpression(type, field.key);
    const method = usesGin(type) ? "GIN" : "BTREE";
    await db.$executeRawUnsafe(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexName}" ON "DataRecord" USING ${method} (${expression}) WHERE "dataModelId" = '${field.dataModelId}' AND "deletedAt" IS NULL`,
    );
    await db.dataFieldIndex.update({ where: { dataFieldId: field.id }, data: { status: "ready" } });
    await db.dataField.update({ where: { id: field.id }, data: { indexed: true } });
  } catch {
    await db.dataFieldIndex.update({
      where: { dataFieldId: field.id },
      data: { status: "failed" },
    });
  }
}

export async function getFieldIndexStatus(
  dataFieldId: string,
): Promise<DataFieldIndexStatus | null> {
  const db = getDb();
  const row = await db.dataFieldIndex.findUnique({ where: { dataFieldId } });
  return (row?.status as DataFieldIndexStatus | undefined) ?? null;
}
