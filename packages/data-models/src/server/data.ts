import { z } from "zod";
import { ValidationError } from "@monark/common";
import { getDb, type Prisma } from "@monark/db";
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
  valueSchemaForField,
  type DataFieldType,
} from "../contracts/field-types";
import { getModelIntegrationDef } from "../contracts/integrations";

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

// Find a free DataModel.key. Platform-wide models (organizationId null)
// share one global key namespace ; org-scoped models are keyed per-org —
// matches the two partial-unique indexes added in the
// 20260706000312_add_data_models migration.
export async function findFreeDataModelKey(
  organizationId: string | null,
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
  /** The caller's org — results include this org's models *and* every
   * platform-wide model (organizationId null), never another org's. */
  organizationId: string;
  includeDeleted?: boolean;
  search?: string;
};

export async function listDataModels(input: ListDataModelsInput): Promise<Paginated<DataModelRow>> {
  const db = getDb();
  const where: Prisma.DataModelWhereInput = {
    OR: [{ organizationId: input.organizationId }, { organizationId: null }],
    ...(input.includeDeleted ? {} : { deletedAt: null }),
    ...(input.search && input.search.trim().length > 0
      ? {
          AND: [
            {
              OR: [{ organizationId: input.organizationId }, { organizationId: null }],
            },
            {
              OR: [
                { name: { contains: input.search, mode: "insensitive" } },
                { key: { contains: input.search, mode: "insensitive" } },
              ],
            },
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

export async function findDataModelByKey(
  organizationId: string | null,
  key: string,
): Promise<DataModelRow | null> {
  const db = getDb();
  return db.dataModel.findFirst({ where: { organizationId, key, deletedAt: null } });
}

export type CreateDataModelInput = {
  organizationId: string | null;
  key: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  createdBy: string;
};

export async function createDataModel(input: CreateDataModelInput): Promise<DataModelRow> {
  const db = getDb();
  return db.dataModel.create({
    data: {
      organizationId: input.organizationId,
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      createdBy: input.createdBy,
    },
  });
}

export type UpdateDataModelPatch = {
  name?: string;
  description?: string | null;
  icon?: string | null;
  titleFieldId?: string | null;
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
      ...(patch.titleFieldId !== undefined ? { titleFieldId: patch.titleFieldId } : {}),
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

export async function createDataField(input: CreateDataFieldInput): Promise<DataFieldRow> {
  const db = getDb();
  const config = fieldConfigSchemas[input.type].parse(input.config ?? {});
  const position =
    input.position ??
    ((await db.dataField.count({ where: { dataModelId: input.dataModelId } })) + 1) * 10;
  return db.dataField.create({
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
  return db.dataField.update({
    where: { id },
    data: {
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(config !== undefined ? { config } : {}),
      ...(patch.required !== undefined ? { required: patch.required } : {}),
    },
  });
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
function recordDataSchema(fields: DataFieldRow[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  return z.object(
    Object.fromEntries(
      fields.map((f) => [
        f.key,
        valueSchemaForField(f.type as DataFieldType, f.config, f.required),
      ]),
    ),
  );
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

async function computeTitle(
  db: ReturnType<typeof getDb>,
  dataModelId: string,
  titleFieldId: string | null,
  data: Record<string, unknown>,
): Promise<string> {
  if (!titleFieldId) return "Untitled";
  const titleField = await db.dataField.findUnique({ where: { id: titleFieldId } });
  if (!titleField || titleField.dataModelId !== dataModelId) return "Untitled";
  const derived = deriveTitle(data[titleField.key], titleField.type as DataFieldType);
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

export type ListDataRecordsInput = PaginationArgs & {
  dataModelId: string;
  includeDeleted?: boolean;
  search?: string;
};

export async function listDataRecords(
  input: ListDataRecordsInput,
): Promise<Paginated<DataRecordRow>> {
  const db = getDb();
  const where: Prisma.DataRecordWhereInput = {
    dataModelId: input.dataModelId,
    ...(input.includeDeleted ? {} : { deletedAt: null }),
    ...(input.search && input.search.trim().length > 0
      ? {
          OR: [
            { title: { contains: input.search, mode: "insensitive" } },
            { slug: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
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

export async function findDataRecordById(id: string): Promise<DataRecordRow | null> {
  const db = getDb();
  return db.dataRecord.findUnique({ where: { id } });
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

export async function createDataRecord(input: CreateDataRecordInput): Promise<DataRecordRow> {
  const db = getDb();
  const model = await db.dataModel.findUniqueOrThrow({ where: { id: input.dataModelId } });
  const fields = await listDataFields(input.dataModelId);
  const parsed = recordDataSchema(fields).parse(input.data);
  const title = await computeTitle(db, model.id, model.titleFieldId, parsed);
  return db.dataRecord.create({
    data: {
      dataModelId: model.id,
      organizationId: model.organizationId,
      slug: input.slug ?? null,
      title,
      data: parsed,
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
  const parsed = recordDataSchema(fields).parse(merged);
  const model = await db.dataModel.findUniqueOrThrow({ where: { id: existing.dataModelId } });
  const title = await computeTitle(db, model.id, model.titleFieldId, parsed);
  return db.dataRecord.update({
    where: { id },
    data: {
      ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
      data: parsed,
      title,
    },
  });
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
