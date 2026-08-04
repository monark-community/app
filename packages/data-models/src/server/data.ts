import { z } from "zod";
import { ValidationError } from "@monark/common";
import { getDb, Prisma } from "@monark/db";
import {
  cursorFindArgs,
  resolveLimit,
  toPage,
  type Paginated,
  type PaginationArgs,
} from "@monark/common/pagination";
import {
  fieldConfigSchemas,
  stripHtmlTags,
  TITLE_FIELD_KEY,
  valueSchemaForField,
  type DataFieldType,
} from "../contracts/field-types";
import {
  coerceFormulaResult,
  evaluateFormula,
  extractFieldRefs,
  FormulaError,
  inferResultType,
} from "../contracts/formula";
import { getModelIntegrationDef } from "../contracts/integrations";
import { DATA_MODEL_FILES_BUCKET } from "../contracts/field-types";
import { ensureBucket, getReadyFilesByIds } from "@monark/files/server";
import type { FilterNode, QueryContext } from "../contracts/query";
import {
  compileFilterToSql,
  type CompileFields,
  type CompileFieldMeta,
  type RelationTargets,
} from "./query-compiler";

export { DATA_FIELD_TYPES } from "../contracts/field-types";
export type { DataFieldType } from "../contracts/field-types";

export type DataModelRow = Prisma.DataModelGetPayload<Record<string, never>>;
export type DataFieldRow = Prisma.DataFieldGetPayload<Record<string, never>>;
export type DataRecordRow = Prisma.DataRecordGetPayload<Record<string, never>>;
export type DataModelIntegrationRow = Prisma.DataModelIntegrationGetPayload<Record<string, never>>;

// Machine-name derivation — lowercase / dash / collapse shape, used here
// for DataModel.key (a URL-safe route segment).
export function keyifyModel(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

// DataField.key is a JSON property name inside DataRecord.data, so it's
// snake_case rather than dash-case, and must start with a letter (a
// leading digit would need bracket-notation access downstream).
export function keyifyField(raw: string): string {
  const base = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 60)
    .replace(/_+$/g, "");
  return /^[a-z]/.test(base) ? base : `f_${base}`;
}

// Find a free DataModel.key. Every Data Model is org-scoped, so keys are
// unique per org (the `@@unique([organizationId, key])` added in the
// 20260707050000_data_models_org_required migration) — two orgs can each
// have a "project" model without collision.
export async function findFreeDataModelKey(
  organizationId: string,
  desired: string,
  ignoreId?: string,
): Promise<string> {
  const db = getDb();
  const base = keyifyModel(desired) || "model";
  for (let n = 0; n < 999; n += 1) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const collision = await db.dataModel.findFirst({
      where: {
        organizationId,
        key: candidate,
        deletedAt: null,
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (!collision) return candidate;
  }
  throw new Error(`could not derive a free data model key from ${JSON.stringify(desired)}`);
}

export async function findFreeDataFieldKey(
  dataModelId: string,
  desired: string,
  ignoreId?: string,
): Promise<string> {
  const db = getDb();
  const base = keyifyField(desired) || "field";
  for (let n = 0; n < 999; n += 1) {
    const candidate = n === 0 ? base : `${base}_${n + 1}`;
    const collision = await db.dataField.findFirst({
      where: { dataModelId, key: candidate, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
      select: { id: true },
    });
    if (!collision) return candidate;
  }
  throw new Error(`could not derive a free data field key from ${JSON.stringify(desired)}`);
}

// ── Data Models ──────────────────────────────────────────

export type ListDataModelsInput = PaginationArgs & {
  /** The caller's org — every Data Model is org-scoped, so this returns
   * exactly this org's models and never another org's. */
  organizationId: string;
  includeDeleted?: boolean;
  search?: string;
};

export async function listDataModels(input: ListDataModelsInput): Promise<Paginated<DataModelRow>> {
  const db = getDb();
  const where: Prisma.DataModelWhereInput = {
    organizationId: input.organizationId,
    ...(input.includeDeleted ? {} : { deletedAt: null }),
    ...(input.search && input.search.trim().length > 0
      ? {
          OR: [
            { name: { contains: input.search, mode: "insensitive" } },
            { key: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const limit = resolveLimit(input.limit);
  const [rows, total] = await Promise.all([
    db.dataModel.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...cursorFindArgs(limit, input.cursor),
    }),
    db.dataModel.count({ where }),
  ]);
  return toPage(rows, total, limit);
}

export async function findDataModelById(id: string): Promise<DataModelRow | null> {
  const db = getDb();
  return db.dataModel.findUnique({ where: { id } });
}

// Every live Data Model across every org. Intentionally unbounded (no
// pagination) : the only caller is boot-time registry hydration
// (`hydrateDataModelRegistrations`), which must walk the full set once to
// re-register per-model permissions + event types into the in-memory
// registries. Not exposed over tRPC.
export async function listAllDataModelsForRegistration(): Promise<DataModelRow[]> {
  const db = getDb();
  return db.dataModel.findMany({ where: { deletedAt: null } });
}

// Every live Data Model for ONE org. Backs the org-scoped visibility
// resolvers (per-model permission / event-type display filtering in the RBAC
// catalog + webhook picker). Intentionally unbounded : an org's model count is
// small + operator-bounded, and this runs only on admin catalog reads.
export async function listLiveDataModelsForOrg(
  organizationId: string,
): Promise<Array<{ key: string; name: string }>> {
  const db = getDb();
  return db.dataModel.findMany({
    where: { organizationId, deletedAt: null },
    select: { key: true, name: true },
  });
}

export async function findDataModelByKey(
  organizationId: string,
  key: string,
): Promise<DataModelRow | null> {
  const db = getDb();
  return db.dataModel.findFirst({ where: { organizationId, key, deletedAt: null } });
}

export type CreateDataModelInput = {
  organizationId: string;
  key: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  createdBy: string;
};

export async function createDataModel(input: CreateDataModelInput): Promise<DataModelRow> {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const model = await tx.dataModel.create({
      data: {
        organizationId: input.organizationId,
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        icon: input.icon ?? null,
        createdBy: input.createdBy,
      },
    });
    // Every model owns a reserved TEXT "title" field whose value backs the
    // record title + pinned primary column. It's a fixed convention (not an
    // admin choice) : created here, first in order, and protected from
    // archive / delete / retype by the router. See `computeTitle`.
    await tx.dataField.create({
      data: {
        dataModelId: model.id,
        key: TITLE_FIELD_KEY,
        label: "Title",
        type: "TEXT",
        config: {},
        required: true,
        position: 0,
      },
    });
    return model;
  });
}

export type UpdateDataModelPatch = {
  name?: string;
  description?: string | null;
  icon?: string | null;
};

export async function updateDataModel(
  id: string,
  patch: UpdateDataModelPatch,
): Promise<DataModelRow> {
  const db = getDb();
  return db.dataModel.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
    },
  });
}

export async function softDeleteDataModel(id: string): Promise<void> {
  const db = getDb();
  await db.dataModel.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function restoreDataModel(id: string): Promise<void> {
  const db = getDb();
  await db.dataModel.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteDataModel(id: string): Promise<void> {
  const db = getDb();
  await db.dataModel.delete({ where: { id } });
}

// ── Data Fields ──────────────────────────────────────────

export async function listDataFields(
  dataModelId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<DataFieldRow[]> {
  const db = getDb();
  return db.dataField.findMany({
    where: {
      dataModelId,
      ...(opts.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
}

export async function findDataFieldById(id: string): Promise<DataFieldRow | null> {
  const db = getDb();
  return db.dataField.findUnique({ where: { id } });
}

export type CreateDataFieldInput = {
  dataModelId: string;
  key: string;
  label: string;
  description?: string | null;
  type: DataFieldType;
  /** Validated + normalized against `fieldConfigSchemas[type]` before persisting. */
  config: unknown;
  required?: boolean;
  position?: number;
};

/** The parsed `{ expression }` of a FORMULA field's config. The result type
 *  isn't stored — it's derived from the expression via `inferResultType`. */
function formulaConfigOf(field: Pick<DataFieldRow, "config">): { expression: string } {
  return fieldConfigSchemas.FORMULA.parse(field.config);
}

// Validates a FORMULA field's expression against the model it belongs to:
// every referenced identifier must be another field's key (never the field
// itself), and the formula dependency graph must stay acyclic (formula A ->
// formula B -> formula A is rejected). Syntax was already checked by the
// config zod ; this is the model-aware layer, so it lives in the data layer
// where the sibling fields are loadable. `selfKey` is the key of the field
// being created/updated ; `selfId` excludes its own current row on update.
async function assertFormulaFieldValid(
  dataModelId: string,
  selfKey: string,
  expression: string,
  selfId?: string,
): Promise<void> {
  let refs: string[];
  try {
    refs = extractFieldRefs(expression);
  } catch (err) {
    throw new ValidationError(err instanceof FormulaError ? err.message : "Invalid formula");
  }

  const fields = await listDataFields(dataModelId);
  const validKeys = new Set(fields.map((f) => f.key));
  validKeys.add(selfKey); // the field being created isn't in the list yet
  for (const ref of refs) {
    if (ref === selfKey) throw new ValidationError(`A formula cannot reference itself ("${ref}")`);
    if (!validKeys.has(ref)) throw new ValidationError(`Formula references unknown field "${ref}"`);
  }

  // Build the formula-only dependency graph with the pending change applied,
  // then check the edited field can't reach itself.
  const exprByKey = new Map<string, string>();
  for (const f of fields) {
    if (f.id === selfId) continue; // superseded by the incoming expression
    if ((f.type as DataFieldType) !== "FORMULA") continue;
    try {
      exprByKey.set(f.key, formulaConfigOf(f).expression);
    } catch {
      // A malformed persisted config shouldn't block an unrelated edit.
    }
  }
  exprByKey.set(selfKey, expression);

  const formulaRefsOf = (key: string): string[] => {
    const expr = exprByKey.get(key);
    if (!expr) return [];
    try {
      return extractFieldRefs(expr).filter((r) => exprByKey.has(r));
    } catch {
      return [];
    }
  };
  const seen = new Set<string>();
  const stack = [...formulaRefsOf(selfKey)];
  while (stack.length > 0) {
    const key = stack.pop() as string;
    if (key === selfKey) {
      throw new ValidationError("Formula fields form a reference cycle");
    }
    if (seen.has(key)) continue;
    seen.add(key);
    stack.push(...formulaRefsOf(key));
  }
}

export async function createDataField(input: CreateDataFieldInput): Promise<DataFieldRow> {
  const db = getDb();
  const config = fieldConfigSchemas[input.type].parse(input.config ?? {});
  if (input.type === "FORMULA") {
    const { expression } = formulaConfigOf({ config });
    await assertFormulaFieldValid(input.dataModelId, input.key, expression);
  }
  const position =
    input.position ??
    ((await db.dataField.count({ where: { dataModelId: input.dataModelId } })) + 1) * 10;
  const created = await db.dataField.create({
    data: {
      dataModelId: input.dataModelId,
      key: input.key,
      label: input.label,
      description: input.description ?? null,
      type: input.type,
      config,
      required: input.required ?? false,
      position,
    },
  });
  // A new FORMULA field has no stored value on any existing record (compute
  // happens on record write), so backfill them now — otherwise the column
  // renders empty for every record that predates the field.
  if (input.type === "FORMULA") await recomputeModelRecords(input.dataModelId);
  return created;
}

export type UpdateDataFieldPatch = {
  label?: string;
  description?: string | null;
  /** Validated against the field's existing `type` — a field's `type` is
   * immutable after create (see the schema comment on DataField.key). */
  config?: unknown;
  required?: boolean;
};

export async function updateDataField(
  id: string,
  patch: UpdateDataFieldPatch,
): Promise<DataFieldRow> {
  const db = getDb();
  const existing = await db.dataField.findUniqueOrThrow({ where: { id } });
  const config =
    patch.config !== undefined
      ? fieldConfigSchemas[existing.type as DataFieldType].parse(patch.config)
      : undefined;
  const formulaChanged = config !== undefined && (existing.type as DataFieldType) === "FORMULA";
  if (formulaChanged) {
    const { expression } = formulaConfigOf({ config });
    await assertFormulaFieldValid(existing.dataModelId, existing.key, expression, existing.id);
  }
  const updated = await db.dataField.update({
    where: { id },
    data: {
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(config !== undefined ? { config } : {}),
      ...(patch.required !== undefined ? { required: patch.required } : {}),
    },
  });
  // A changed formula expression makes every record's stored value stale ;
  // recompute them so the new formula is reflected everywhere, not just on
  // the next time each record happens to be edited.
  if (formulaChanged) await recomputeModelRecords(existing.dataModelId);
  return updated;
}

// Full-reorder : `orderedIds` is every non-archived field id for the model,
// in the desired order. Position is assigned in steps of 10 so a future
// single-field move can slot in between two without renumbering everything.
export async function reorderDataFields(dataModelId: string, orderedIds: string[]): Promise<void> {
  const db = getDb();
  await db.$transaction(
    orderedIds.map((id, index) =>
      db.dataField.update({
        where: { id, dataModelId },
        data: { position: (index + 1) * 10 },
      }),
    ),
  );
}

export async function archiveDataField(id: string): Promise<void> {
  const db = getDb();
  await db.dataField.update({ where: { id }, data: { archivedAt: new Date() } });
}

export async function unarchiveDataField(id: string): Promise<void> {
  const db = getDb();
  await db.dataField.update({ where: { id }, data: { archivedAt: null } });
}

// ── Data Records ─────────────────────────────────────────

// Builds the zod object schema for a whole record from its model's active
// fields, via the shared `valueSchemaForField` (one implementation with the
// client's dynamic form — see the module README). Unknown keys in the
// payload are stripped (default z.object() behavior), not silently
// accepted, so a stale client can't write orphan JSON keys.
//
// FORMULA fields are omitted entirely : they're computed, read-only, and
// recomputed from the record's own data on every write (see
// `applyComputedFields`), so any client-supplied value for one is dropped
// here rather than trusted.
function recordDataSchema(fields: DataFieldRow[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  return z.object(
    Object.fromEntries(
      fields
        .filter((f) => (f.type as DataFieldType) !== "FORMULA")
        .map((f) => [f.key, valueSchemaForField(f.type as DataFieldType, f.config, f.required)]),
    ),
  );
}

// Compute-on-write for FORMULA fields : evaluate each formula from the
// record's own field values and write the (coerced) result back into `data`,
// so formula columns are stored like any other value and stay filterable /
// sortable. Formulas that reference other formulas evaluate in dependency
// order, so a chained formula sees its upstream's fresh result. A formula
// that fails to evaluate degrades to `null` (the engine is total — see
// contracts/formula.ts). Returns a new object ; never mutates the input.
function applyComputedFields(
  fields: DataFieldRow[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const formulaFields = fields.filter((f) => (f.type as DataFieldType) === "FORMULA");
  if (formulaFields.length === 0) return data;

  const byKey = new Map(formulaFields.map((f) => [f.key, f]));
  // Topological order over formula-to-formula references (a DFS post-order),
  // falling back to declaration order for any residual cycle (validation
  // rejects cycles at field-save time, so this is belt-and-suspenders).
  const ordered: DataFieldRow[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (field: DataFieldRow): void => {
    if (visited.has(field.key) || visiting.has(field.key)) return;
    visiting.add(field.key);
    let expression = "";
    try {
      expression = formulaConfigOf(field).expression;
      for (const ref of extractFieldRefs(expression)) {
        const dep = byKey.get(ref);
        if (dep) visit(dep);
      }
    } catch {
      // Malformed config / parse error — order it as-is ; eval will null it.
    }
    visiting.delete(field.key);
    visited.add(field.key);
    ordered.push(field);
  };
  for (const f of formulaFields) visit(f);

  const out = { ...data };
  for (const field of ordered) {
    try {
      const { expression } = formulaConfigOf(field);
      const value = evaluateFormula(expression, out);
      out[field.key] = coerceFormulaResult(value, inferResultType(expression));
    } catch {
      out[field.key] = null;
    }
  }
  return out;
}

// Plain-text label for the denormalized `DataRecord.title` column, derived
// from the model's title field (if one is configured). Capped so a huge
// long-text/rich-text value can't balloon the column ; RICH_TEXT is
// stripped to plain text first.
function deriveTitle(value: unknown, type: DataFieldType | undefined): string {
  if (value == null) return "";
  const raw =
    type === "RICH_TEXT" && typeof value === "string"
      ? // Tag-stripping replaces each tag with a space, which can leave
        // doubled-up whitespace at former tag boundaries — collapse it so a
        // title like "<p>Hello <strong>world</strong></p>" reads "Hello world",
        // not "Hello  world".
        stripHtmlTags(value).replace(/\s+/g, " ")
      : Array.isArray(value)
        ? value.map((v) => String(v)).join(", ")
        : value instanceof Date
          ? value.toISOString()
          : String(value);
  return raw.trim().slice(0, 200);
}

// The record title is the value of the model's reserved `title` field (a
// required TEXT field every model owns). No DB lookup or title-field pointer
// is needed ; a blank value still falls back to "Untitled" for display safety.
function computeTitle(data: Record<string, unknown>): string {
  const derived = deriveTitle(data[TITLE_FIELD_KEY], "TEXT");
  return derived.length > 0 ? derived : "Untitled";
}

export async function findFreeDataRecordSlug(
  dataModelId: string,
  desired: string,
  ignoreId?: string,
): Promise<string> {
  const db = getDb();
  const base = keyifyModel(desired) || "record";
  for (let n = 0; n < 999; n += 1) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const collision = await db.dataRecord.findFirst({
      where: {
        dataModelId,
        slug: candidate,
        deletedAt: null,
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (!collision) return candidate;
  }
  throw new Error(`could not derive a free data record slug from ${JSON.stringify(desired)}`);
}

// ── Per-record role access (row-level authorization) ──────
// Mirrors CalendarRoleAccess : a record with NO access rows is visible to
// everyone who can access its model ; with rows, only those roles. Data
// admins (`bypass`, resolved from `data-models.manage-schema` in the router)
// skip the filter entirely. See the DataRecordRoleAccess model comment.

/** Prisma `where` fragment restricting to records the caller's roles may see.
 *  Empty (`{}`) when bypassing, so it composes harmlessly inside an `AND`. */
function recordRoleAccessWhere(opts: {
  roleIds: string[];
  bypass: boolean;
}): Prisma.DataRecordWhereInput {
  if (opts.bypass) return {};
  return {
    OR: [
      { roleAccess: { none: {} } },
      ...(opts.roleIds.length > 0
        ? [{ roleAccess: { some: { roleId: { in: opts.roleIds } } } }]
        : []),
    ],
  };
}

/** A single field-value predicate from the records list filter menu. `value`
 *  is the raw filter-control value : a string for text/number/boolean/date/
 *  select, or a `string[]` for `selectAny` / multi-select. */
export type RecordFieldFilter = {
  /** The `DataField.key` to filter on (the JSONB `data` object's key). */
  key: string;
  type: "text" | "number" | "boolean" | "date" | "select" | "selectAny" | "multiSelect";
  value: string | string[];
};

/** Translate one field filter into a Prisma `where` fragment against the JSONB
 *  `data` column (keyed by field key). Returns `null` for a neutral / empty
 *  value so it composes out of the `AND`. Text/date use substring match ;
 *  select/number/boolean use equality ; `selectAny` matches a scalar single-
 *  select against any of the chosen values ; multi-select matches records whose
 *  stored array contains any of the chosen values.
 *
 *  NOTE: JSON `string_contains` is case-sensitive (Postgres JSON paths take no
 *  `mode`). The baseline GIN index on `data` keeps these correct ; a fast plan
 *  on a hot field at scale is opt-in via `fields.requestIndex` (see indexing.ts). */
function fieldFilterWhere(f: RecordFieldFilter): Prisma.DataRecordWhereInput | null {
  const path = [f.key];
  const asString = typeof f.value === "string" ? f.value.trim() : "";
  switch (f.type) {
    case "text":
    case "date":
      return asString ? { data: { path, string_contains: asString } } : null;
    case "select":
      return asString ? { data: { path, equals: asString } } : null;
    case "selectAny": {
      // A single-select field stores a scalar string, so "match any of these
      // values" is an OR of equalities (not `array_contains`, which is for the
      // multi-select `string[]` encoding).
      const vals = (Array.isArray(f.value) ? f.value : [f.value]).filter((v) => v !== "");
      if (vals.length === 0) return null;
      return { OR: vals.map((v) => ({ data: { path, equals: v } })) };
    }
    case "number": {
      if (asString === "") return null;
      const n = Number(asString);
      return Number.isFinite(n) ? { data: { path, equals: n } } : null;
    }
    case "boolean":
      if (asString !== "true" && asString !== "false") return null;
      return { data: { path, equals: asString === "true" } };
    case "multiSelect": {
      const vals = (Array.isArray(f.value) ? f.value : [f.value]).filter((v) => v !== "");
      if (vals.length === 0) return null;
      // OR = "matches any selected value" ; `array_contains: [v]` is Postgres
      // `@>` containment against the stored `string[]`.
      return { OR: vals.map((v) => ({ data: { path, array_contains: [v] } })) };
    }
  }
}

export type ListDataRecordsInput = PaginationArgs & {
  dataModelId: string;
  includeDeleted?: boolean;
  search?: string;
  /** Per-field value predicates from the list filter menu (ANDed together). */
  fieldFilters?: RecordFieldFilter[];
  /** Caller's role ids ; records are filtered to those the roles may access. */
  roleIds?: string[];
  /** When true (a data admin), the role-access filter is skipped. */
  bypassRoleAccess?: boolean;
};

export async function listDataRecords(
  input: ListDataRecordsInput,
): Promise<Paginated<DataRecordRow>> {
  const db = getDb();
  const search = input.search?.trim();
  const fieldWheres = (input.fieldFilters ?? [])
    .map(fieldFilterWhere)
    .filter((w): w is Prisma.DataRecordWhereInput => w !== null);
  const where: Prisma.DataRecordWhereInput = {
    dataModelId: input.dataModelId,
    ...(input.includeDeleted ? {} : { deletedAt: null }),
    AND: [
      ...(search && search.length > 0
        ? [
            {
              OR: [
                { title: { contains: search, mode: "insensitive" as const } },
                { slug: { contains: search, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
      ...fieldWheres,
      recordRoleAccessWhere({
        roleIds: input.roleIds ?? [],
        bypass: input.bypassRoleAccess ?? false,
      }),
    ],
  };
  const limit = resolveLimit(input.limit);
  const [rows, total] = await Promise.all([
    db.dataRecord.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...cursorFindArgs(limit, input.cursor),
    }),
    db.dataRecord.count({ where }),
  ]);
  return toPage(rows, total, limit);
}

// ── Structured query language (MonarkQL) list path ───────
//
// Unlike `listDataRecords` (structured Prisma `where`, driven by the legacy
// filter menu), the query-language path compiles a `FilterNode` tree to raw
// SQL — the only way to get case-insensitive `ILIKE` and to hit the expression
// indexes in `indexing.ts`. It stays keyset-paginated with the SAME cursor
// contract (last row's id, `updatedAt desc, id desc`) so the shared
// `usePaginatedList` / `Paginated<T>` convention holds ; the cursor row's sort
// key is resolved via a subquery so a bare id is still a valid cursor.

/** The stored value is a JSON array (drives array vs scalar SQL). */
function isArrayValued(field: DataFieldRow): boolean {
  if (field.type === "MULTI_SELECT" || field.type === "ATTACHMENTS") return true;
  if (field.type === "RELATION") {
    const config = field.config as { cardinality?: unknown } | null;
    return config?.cardinality === "MANY";
  }
  return false;
}

/** Build the compiler's field-metadata map from a model's `DataField` rows.
 *  Archived fields are excluded — you can't filter on a field that's gone. */
export function buildCompileFields(fields: DataFieldRow[]): CompileFields {
  const map: CompileFields = new Map();
  for (const f of fields) {
    if (f.archivedAt) continue;
    const meta: CompileFieldMeta = { type: f.type, arrayValued: isArrayValued(f) };
    if (f.type === "FORMULA") {
      const config = f.config as { expression?: unknown } | null;
      if (typeof config?.expression === "string") meta.formulaExpression = config.expression;
    }
    map.set(f.key, meta);
  }
  return map;
}

export type ListDataRecordsByQueryInput = PaginationArgs & {
  dataModelId: string;
  includeDeleted?: boolean;
  search?: string;
  /** The compiled query tree. */
  filter: FilterNode;
  /** Field metadata for the model, from {@link buildCompileFields}. */
  fields: CompileFields;
  /** Caller id + "now", to resolve `@variable` values in the tree. */
  queryContext?: QueryContext;
  /** Resolved target models for `relation.subField` traversal (built by the
   *  router, which has DB + access context). */
  relationTargets?: RelationTargets;
  roleIds?: string[];
  bypassRoleAccess?: boolean;
};

/** Raw-SQL role-access predicate, mirroring {@link recordRoleAccessWhere} : a
 *  record with no role restriction is visible to all ; otherwise the caller
 *  must hold one of its roles. `alias` is the record's table alias ("r" for the
 *  main list, "t" for a relation-traversal target) — a compile-time constant,
 *  never request input. Exported so the router can build a traversal target's
 *  predicate (see {@link RelationTarget}). */
export function recordRoleAccessSql(roleIds: string[], bypass: boolean, alias = "r"): Prisma.Sql {
  if (bypass) return Prisma.sql`TRUE`;
  const rowId = Prisma.raw(`${alias}.id`);
  const unrestricted = Prisma.sql`NOT EXISTS (SELECT 1 FROM "DataRecordRoleAccess" ra WHERE ra."dataRecordId" = ${rowId})`;
  if (roleIds.length === 0) return Prisma.sql`(${unrestricted})`;
  const held = Prisma.sql`EXISTS (SELECT 1 FROM "DataRecordRoleAccess" ra WHERE ra."dataRecordId" = ${rowId} AND ra."roleId" IN (${Prisma.join(
    roleIds.map((id) => Prisma.sql`${id}`),
  )}))`;
  return Prisma.sql`(${unrestricted} OR ${held})`;
}

export async function listDataRecordsWithQuery(
  input: ListDataRecordsByQueryInput,
): Promise<Paginated<DataRecordRow>> {
  const db = getDb();
  const limit = resolveLimit(input.limit);
  const search = input.search?.trim();

  // Conditions shared by the page + count queries (everything except the
  // keyset cursor window).
  const base: Prisma.Sql[] = [Prisma.sql`r."dataModelId" = ${input.dataModelId}`];
  if (!input.includeDeleted) base.push(Prisma.sql`r."deletedAt" IS NULL`);
  if (search && search.length > 0) {
    const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    base.push(Prisma.sql`(r.title ILIKE ${like} OR r.slug ILIKE ${like})`);
  }
  base.push(
    compileFilterToSql(input.filter, input.fields, input.queryContext, input.relationTargets),
  );
  base.push(recordRoleAccessSql(input.roleIds ?? [], input.bypassRoleAccess ?? false));
  const baseWhere = Prisma.join(base, " AND ");

  // Keyset window : rows ordered after the cursor row in (updatedAt desc, id
  // desc). The cursor is a bare id ; resolve its sort key via a subquery so an
  // invalidated cursor simply yields an empty page (NULL comparison).
  const pageWhere = input.cursor
    ? Prisma.sql`${baseWhere} AND (r."updatedAt", r.id) < (SELECT c."updatedAt", c.id FROM "DataRecord" c WHERE c.id = ${input.cursor})`
    : baseWhere;

  const [rows, countRows] = await Promise.all([
    db.$queryRaw<DataRecordRow[]>(
      Prisma.sql`SELECT r.id, r."dataModelId", r."organizationId", r.slug, r.title, r.data,
                        r."createdAt", r."updatedAt", r."deletedAt", r."createdBy"
                 FROM "DataRecord" r
                 WHERE ${pageWhere}
                 ORDER BY r."updatedAt" DESC, r.id DESC
                 LIMIT ${limit + 1}`,
    ),
    db.$queryRaw<{ count: number }[]>(
      Prisma.sql`SELECT count(*)::int AS count FROM "DataRecord" r WHERE ${baseWhere}`,
    ),
  ]);
  return toPage(rows, countRows[0]?.count ?? 0, limit);
}

export async function findDataRecordById(id: string): Promise<DataRecordRow | null> {
  const db = getDb();
  return db.dataRecord.findUnique({ where: { id } });
}

// ── Saved views (named MonarkQL queries) ─────────────────

export type DataRecordViewRow = Prisma.DataRecordViewGetPayload<Record<string, never>>;

/** A model's saved views visible to `userId` : their own plus anyone's shared
 *  ones. Not cursor-paginated — a user's saved queries for one model are
 *  inherently few (there's no unbounded fan-out here). Ordered shared-first
 *  then by name, ending in id for a stable sort. */
export async function listDataRecordViews(
  dataModelId: string,
  userId: string,
): Promise<DataRecordViewRow[]> {
  const db = getDb();
  return db.dataRecordView.findMany({
    where: { dataModelId, OR: [{ createdBy: userId }, { shared: true }] },
    orderBy: [{ shared: "asc" }, { name: "asc" }, { id: "asc" }],
  });
}

export async function findDataRecordViewById(id: string): Promise<DataRecordViewRow | null> {
  const db = getDb();
  return db.dataRecordView.findUnique({ where: { id } });
}

export type CreateDataRecordViewInput = {
  dataModelId: string;
  organizationId: string;
  name: string;
  query: FilterNode;
  shared?: boolean;
  createdBy: string;
};

export async function createDataRecordView(
  input: CreateDataRecordViewInput,
): Promise<DataRecordViewRow> {
  const db = getDb();
  return db.dataRecordView.create({
    data: {
      dataModelId: input.dataModelId,
      organizationId: input.organizationId,
      name: input.name,
      // The FilterNode tree stored verbatim as JSON (validated at the router).
      query: input.query as unknown as Prisma.InputJsonValue,
      shared: input.shared ?? false,
      createdBy: input.createdBy,
    },
  });
}

export type UpdateDataRecordViewPatch = {
  name?: string;
  query?: FilterNode;
  shared?: boolean;
};

export async function updateDataRecordView(
  id: string,
  patch: UpdateDataRecordViewPatch,
): Promise<DataRecordViewRow> {
  const db = getDb();
  return db.dataRecordView.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.query !== undefined
        ? { query: patch.query as unknown as Prisma.InputJsonValue }
        : {}),
      ...(patch.shared !== undefined ? { shared: patch.shared } : {}),
    },
  });
}

export async function deleteDataRecordView(id: string): Promise<void> {
  const db = getDb();
  await db.dataRecordView.delete({ where: { id } });
}

// True when the caller's roles may access this specific record (or `bypass`).
// Layered AFTER the model-level permission check in the router.
export async function isDataRecordRoleAccessible(
  recordId: string,
  opts: { roleIds: string[]; bypass: boolean },
): Promise<boolean> {
  if (opts.bypass) return true;
  const db = getDb();
  const hit = await db.dataRecord.findFirst({
    where: { id: recordId, ...recordRoleAccessWhere({ ...opts, bypass: false }) },
    select: { id: true },
  });
  return hit !== null;
}

/** The role ids explicitly granted access to a record (empty = open to all). */
export async function getDataRecordRoleAccess(recordId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.dataRecordRoleAccess.findMany({
    where: { dataRecordId: recordId },
    select: { roleId: true },
  });
  return rows.map((r) => r.roleId);
}

/** Replace a record's role-access list wholesale. Empty `roleIds` opens it to
 *  everyone who can access the model. */
export async function setDataRecordRoleAccess(recordId: string, roleIds: string[]): Promise<void> {
  const db = getDb();
  const unique = [...new Set(roleIds)];
  await db.$transaction([
    db.dataRecordRoleAccess.deleteMany({ where: { dataRecordId: recordId } }),
    ...(unique.length > 0
      ? [
          db.dataRecordRoleAccess.createMany({
            data: unique.map((roleId) => ({ dataRecordId: recordId, roleId })),
          }),
        ]
      : []),
  ]);
}

export async function findDataRecordBySlug(
  dataModelId: string,
  slug: string,
): Promise<DataRecordRow | null> {
  const db = getDb();
  return db.dataRecord.findFirst({ where: { dataModelId, slug, deletedAt: null } });
}

export type CreateDataRecordInput = {
  dataModelId: string;
  slug?: string | null;
  /** Raw payload keyed by DataField.key ; validated against the model's
   * active fields before persisting. */
  data: Record<string, unknown>;
  createdBy: string;
};

/** Ensure the shared private bucket every FILE / ATTACHMENTS field uploads into
 *  exists. Best-effort + idempotent ; call once at api boot. */
export async function ensureDataModelFilesBucket(): Promise<void> {
  await ensureBucket({ name: DATA_MODEL_FILES_BUCKET, isPublic: false, createdBy: "system" });
}

/** True when `contentType` satisfies the field's MIME allow-list. An entry may
 *  be an exact type ("application/pdf") or a wildcard prefix ("image/*") ; an
 *  empty / absent list accepts anything. */
function mimeAllowed(contentType: string, allowedFormats: string[] | undefined): boolean {
  if (!allowedFormats || allowedFormats.length === 0) return true;
  const ct = contentType.toLowerCase();
  return allowedFormats.some((fmt) => {
    const f = fmt.toLowerCase();
    return f.endsWith("/*") ? ct.startsWith(f.slice(0, -1)) : ct === f;
  });
}

/**
 * Validate a record's FILE / ATTACHMENTS references against the *resolved*
 * `StoredFile`s : each id must be a READY file in the same org, of an allowed
 * MIME type, within the size cap, and (attachments) within the count cap. The
 * value schema only checked the id *shape* ; this closes the hole where a
 * client could stash an arbitrary, cross-org, or oversized/wrong-type id.
 */
async function validateFileReferences(
  fields: DataFieldRow[],
  data: Record<string, unknown>,
  organizationId: string,
): Promise<void> {
  const fileFields = fields.filter((f) => f.type === "FILE" || f.type === "ATTACHMENTS");
  if (fileFields.length === 0) return;

  const idsByField = new Map<string, string[]>();
  const allIds = new Set<string>();
  for (const f of fileFields) {
    const raw = data[f.key];
    const ids =
      f.type === "FILE"
        ? typeof raw === "string" && raw.length > 0
          ? [raw]
          : []
        : Array.isArray(raw)
          ? raw.filter((v): v is string => typeof v === "string" && v.length > 0)
          : [];
    idsByField.set(f.key, ids);
    for (const id of ids) allIds.add(id);
  }
  if (allIds.size === 0) return;

  const rows = await getReadyFilesByIds(organizationId, [...allIds]);
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const f of fileFields) {
    const ids = idsByField.get(f.key) ?? [];
    if (ids.length === 0) continue;
    const config = fieldConfigSchemas[f.type as DataFieldType].parse(f.config) as {
      allowedFormats?: string[];
      maxSizeBytes?: number;
      max?: number;
    };
    if (f.type === "ATTACHMENTS" && config.max != null && ids.length > config.max) {
      throw new ValidationError(`Field "${f.key}" accepts at most ${config.max} file(s).`);
    }
    for (const id of ids) {
      const file = byId.get(id);
      if (!file) {
        throw new ValidationError(`Field "${f.key}" references a file that isn't available.`);
      }
      if (!mimeAllowed(file.contentType, config.allowedFormats)) {
        throw new ValidationError(`Field "${f.key}" doesn't accept "${file.contentType}" files.`);
      }
      if (config.maxSizeBytes != null && file.size > config.maxSizeBytes) {
        throw new ValidationError(`Field "${f.key}" file exceeds the size limit.`);
      }
    }
  }
}

export async function createDataRecord(input: CreateDataRecordInput): Promise<DataRecordRow> {
  const db = getDb();
  const model = await db.dataModel.findUniqueOrThrow({ where: { id: input.dataModelId } });
  const fields = await listDataFields(input.dataModelId);
  const parsed = applyComputedFields(fields, recordDataSchema(fields).parse(input.data));
  await validateFileReferences(fields, parsed, model.organizationId);
  const title = computeTitle(parsed);
  return db.dataRecord.create({
    data: {
      dataModelId: model.id,
      organizationId: model.organizationId,
      slug: input.slug ?? null,
      title,
      data: parsed as Prisma.InputJsonValue,
      createdBy: input.createdBy,
    },
  });
}

export type UpdateDataRecordPatch = {
  slug?: string | null;
  /** Partial overlay onto the existing `data` ; only the provided keys
   * change. The merged object is re-validated in full so a required field
   * can't be cleared out from under an existing record. */
  data?: Record<string, unknown>;
};

export async function updateDataRecord(
  id: string,
  patch: UpdateDataRecordPatch,
): Promise<DataRecordRow> {
  const db = getDb();
  const existing = await db.dataRecord.findUniqueOrThrow({ where: { id } });
  const fields = await listDataFields(existing.dataModelId);
  const merged = { ...(existing.data as Record<string, unknown>), ...(patch.data ?? {}) };
  const parsed = applyComputedFields(fields, recordDataSchema(fields).parse(merged));
  await validateFileReferences(fields, parsed, existing.organizationId);
  const title = computeTitle(parsed);
  return db.dataRecord.update({
    where: { id },
    data: {
      ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
      data: parsed as Prisma.InputJsonValue,
      title,
    },
  });
}

// Recompute every record's FORMULA values for a model, in place. Called after
// a formula field is created or its expression changes, so stored values
// reflect the current formulas without waiting for each record to be edited
// again. No-op when the model has no formula fields. The denormalized title
// comes from the reserved TEXT `title` field, which no formula can change, so
// it's never touched here.
//
// Intentionally unbounded : this is an admin schema-time action (infrequent,
// bounded by the model's own record count), not a per-request read. Records
// whose computed values don't actually change are skipped, so re-saving a
// formula that yields the same output writes nothing.
export async function recomputeModelRecords(dataModelId: string): Promise<number> {
  const db = getDb();
  const fields = await listDataFields(dataModelId);
  if (!fields.some((f) => (f.type as DataFieldType) === "FORMULA")) return 0;

  const records = await db.dataRecord.findMany({ where: { dataModelId, deletedAt: null } });

  let changed = 0;
  for (const rec of records) {
    const before = (rec.data as Record<string, unknown>) ?? {};
    const after = applyComputedFields(fields, before);
    if (JSON.stringify(after) === JSON.stringify(before)) continue; // nothing to write
    await db.dataRecord.update({
      where: { id: rec.id },
      data: { data: after as Prisma.InputJsonValue },
    });
    changed += 1;
  }
  return changed;
}

export async function softDeleteDataRecord(id: string): Promise<void> {
  const db = getDb();
  await db.dataRecord.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function restoreDataRecord(id: string): Promise<void> {
  const db = getDb();
  await db.dataRecord.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteDataRecord(id: string): Promise<void> {
  const db = getDb();
  await db.dataRecord.delete({ where: { id } });
}

// ── Model Integrations ───────────────────────────────────

export async function listModelIntegrationsForModel(
  dataModelId: string,
): Promise<DataModelIntegrationRow[]> {
  const db = getDb();
  return db.dataModelIntegration.findMany({ where: { dataModelId } });
}

export async function findModelIntegration(
  dataModelId: string,
  module: string,
): Promise<DataModelIntegrationRow | null> {
  const db = getDb();
  return db.dataModelIntegration.findUnique({
    where: { dataModelId_module: { dataModelId, module } },
  });
}

export type UpsertModelIntegrationInput = {
  dataModelId: string;
  module: string;
  /** slotKey -> DataField.id. */
  slotMappings: Record<string, string>;
  enabled: boolean;
};

// Validates the proposed mapping against the module's registered slot
// definitions (a slot's allowed field types, its `relationTarget` when
// present, and — only when `enabled` — that every required slot is
// mapped) before upserting. This is where "mapping, not reserved field
// keys" is enforced : nothing here assumes any particular field key name,
// only that the *type* (and, for RELATION, the target) satisfies the
// slot the owning module declared.
export async function upsertModelIntegration(
  input: UpsertModelIntegrationInput,
): Promise<DataModelIntegrationRow> {
  const def = getModelIntegrationDef(input.module);
  if (!def) {
    throw new ValidationError(
      `Unknown integration module "${input.module}" — it must call registerModelIntegration at boot before an admin can configure it.`,
    );
  }

  const db = getDb();
  const fieldIds = Object.values(input.slotMappings);
  const fields =
    fieldIds.length > 0
      ? await db.dataField.findMany({
          where: { id: { in: fieldIds }, dataModelId: input.dataModelId },
        })
      : [];
  const fieldsById = new Map(fields.map((f) => [f.id, f]));

  for (const [slotKey, slotDef] of Object.entries(def.slots)) {
    const fieldId = input.slotMappings[slotKey];
    if (!fieldId) {
      if (slotDef.required && input.enabled) {
        throw new ValidationError(
          `Integration "${input.module}" requires slot "${slotKey}" to be mapped before it can be enabled.`,
        );
      }
      continue;
    }
    const field = fieldsById.get(fieldId);
    if (!field) {
      throw new ValidationError(
        `slotMappings.${slotKey} must reference a field on this Data Model.`,
      );
    }
    if (!slotDef.types.includes(field.type as DataFieldType)) {
      throw new ValidationError(
        `slotMappings.${slotKey}'s field type "${field.type}" isn't allowed for this slot (expected one of: ${slotDef.types.join(", ")}).`,
      );
    }
    if (slotDef.relationTarget) {
      const config = field.config as { relationTarget?: string } | null;
      if (config?.relationTarget !== slotDef.relationTarget) {
        throw new ValidationError(
          `slotMappings.${slotKey} must be a RELATION field targeting "${slotDef.relationTarget}".`,
        );
      }
    }
  }

  return db.dataModelIntegration.upsert({
    where: { dataModelId_module: { dataModelId: input.dataModelId, module: input.module } },
    create: {
      dataModelId: input.dataModelId,
      module: input.module,
      slotMappings: input.slotMappings,
      enabled: input.enabled,
    },
    update: { slotMappings: input.slotMappings, enabled: input.enabled },
  });
}
