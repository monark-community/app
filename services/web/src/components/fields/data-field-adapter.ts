import type { FieldDef, RelationSource, SelectOption } from "./types";

/**
 * The server's field-type vocabulary — mirrors `DataFieldType` in
 * `@monark/data-models/contracts` (SCREAMING_SNAKE). Duplicated here rather
 * than imported : that package's `/contracts` subpath is safe to import
 * (isomorphic, no Prisma), but keeping this adapter's input shape
 * structural rather than nominal means a `trpc.dataModels.fields.list`
 * result — whose TypeScript type flows in through `AppRouter` inference,
 * not a direct import of the data-models package — satisfies it without
 * an extra cast at every call site.
 */
export type DataFieldServerType =
  | "TEXT"
  | "LONG_TEXT"
  | "RICH_TEXT"
  | "NUMBER"
  | "BOOLEAN"
  | "DATE"
  | "DATETIME"
  | "SELECT"
  | "MULTI_SELECT"
  | "RELATION"
  | "URL"
  | "EMAIL";

/** The subset of a `DataField` row this adapter needs. */
export interface DataFieldForAdapter {
  id: string;
  key: string;
  label: string;
  description: string | null;
  type: DataFieldServerType;
  config: unknown;
  required: boolean;
}

/** Structural shapes of the per-type `config` JSON — see
 * `@monark/data-models/contracts`'s `fieldConfigSchemas` for the source of
 * truth these mirror. */
interface TextConfig {
  minLength?: number;
  maxLength?: number;
}
interface NumberConfig {
  min?: number;
  max?: number;
  integer?: boolean;
}
interface SelectConfig {
  options: SelectOption[];
}
interface MultiSelectConfig extends SelectConfig {
  allowCustomValues?: boolean;
  max?: number;
}
interface RelationConfig {
  relationTarget: string;
  relationTargetKind: "DATA_MODEL" | "SYSTEM_MODEL";
  cardinality: "ONE" | "MANY";
  max?: number;
}

/** Resolves a RELATION field's async options source. The adapter never
 * fetches anything itself (same rule as `RelationSource` generally) — the
 * caller wires this to tRPC, keyed off the field's own `relationTarget` /
 * `relationTargetKind` so one resolver can serve every relation field on a
 * page (e.g. "DATA_MODEL" targets query `dataModels.records.*`, a
 * "SYSTEM_MODEL" target like `"Calendar"` queries that module's own list). */
export type RelationSourceResolver = (config: RelationConfig) => RelationSource;

const emptyRelationSource = (model: string): RelationSource => ({
  model,
  loadOptions: async () => [],
  loadByIds: async () => [],
});

/**
 * Maps one `DataField` row onto the client `FieldDef` the fields toolkit
 * (`AutoForm`, `fieldColumn`) understands — the one seam a polymorphic
 * Data Field is supposed to cross 1:1, per docs/features-planning/phase-2/
 * polymorphic-db.md. `label`/`description` are already admin-authored
 * strings (not i18n keys) ; `required` carries straight through.
 */
export function dataFieldToFieldDef(
  field: DataFieldForAdapter,
  opts: { relationSource?: RelationSourceResolver } = {},
): FieldDef {
  const base = {
    name: field.key,
    label: field.label,
    description: field.description ?? undefined,
    required: field.required,
  };
  switch (field.type) {
    case "TEXT": {
      const c = field.config as TextConfig;
      return { ...base, type: "text", minLength: c.minLength, maxLength: c.maxLength };
    }
    case "LONG_TEXT": {
      const c = field.config as TextConfig;
      return { ...base, type: "longText", minLength: c.minLength, maxLength: c.maxLength };
    }
    case "RICH_TEXT":
      return { ...base, type: "richText" };
    case "NUMBER": {
      const c = field.config as NumberConfig;
      return { ...base, type: "number", min: c.min, max: c.max, integer: c.integer };
    }
    case "BOOLEAN":
      return { ...base, type: "boolean" };
    case "DATE":
      return { ...base, type: "date" };
    case "DATETIME":
      return { ...base, type: "datetime" };
    case "SELECT": {
      const c = field.config as SelectConfig;
      return { ...base, type: "singleSelect", options: c.options };
    }
    case "MULTI_SELECT": {
      const c = field.config as MultiSelectConfig;
      return {
        ...base,
        type: "multiSelect",
        options: c.options,
        allowCustom: c.allowCustomValues,
        max: c.max,
      };
    }
    case "RELATION": {
      const c = field.config as RelationConfig;
      const source = opts.relationSource?.(c) ?? emptyRelationSource(c.relationTarget);
      return { ...base, type: "relation", source, multiple: c.cardinality === "MANY", max: c.max };
    }
    case "URL": {
      const c = field.config as TextConfig;
      return { ...base, type: "url", maxLength: c.maxLength };
    }
    case "EMAIL": {
      const c = field.config as TextConfig;
      return { ...base, type: "email", maxLength: c.maxLength };
    }
  }
}

/**
 * `DataRecord.data` round-trips DATE/DATETIME values as ISO strings (JSON
 * has no Date type — see the data-models package's README, "Dates
 * round-trip through JSONB as strings"). `AutoForm`'s date/datetime inputs
 * need a real `Date` (or `null`) to seed their picker ; this converts one
 * record's raw `data` payload into `AutoForm`-ready `defaultValues`, given
 * the model's active fields.
 */
export function recordDataToDefaultValues(
  fields: DataFieldForAdapter[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };
  for (const field of fields) {
    if (field.type !== "DATE" && field.type !== "DATETIME") continue;
    const raw = data[field.key];
    if (raw == null) {
      result[field.key] = null;
      continue;
    }
    if (raw instanceof Date) continue;
    const parsed = new Date(raw as string);
    result[field.key] = Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return result;
}
