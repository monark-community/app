import { z } from "zod";

/**
 * The v1 field-type catalog for the polymorphic Data Model engine. Mirrors
 * the Prisma `DataFieldType` enum ; kept as a hand-written union here so
 * typecheck doesn't depend on a fresh `pnpm db:generate`.
 */
export const DATA_FIELD_TYPES = [
  "TEXT",
  "LONG_TEXT",
  "RICH_TEXT",
  "NUMBER",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "SELECT",
  "MULTI_SELECT",
  "RELATION",
  "URL",
  "EMAIL",
  "FORMULA",
  "FILE",
  "ATTACHMENTS",
] as const;
export type DataFieldType = (typeof DATA_FIELD_TYPES)[number];

/**
 * The reserved field key every Data Model owns. A TEXT field with this key is
 * auto-created on model creation and backs `DataRecord.title` + the pinned
 * primary column ; it's protected from archive / delete / retype. The record
 * title is this field's value — never an admin-chosen "title field" pointer.
 */
export const TITLE_FIELD_KEY = "title";

/**
 * The single private `@monark/files` bucket every Data Model FILE / ATTACHMENTS
 * field uploads into (auto-provisioned ; see `ensureDataModelFilesBucket`). The
 * *field* config (allowed formats, max size) is the real gate, so the bucket
 * stays permissive and one bucket serves every file field.
 */
export const DATA_MODEL_FILES_BUCKET = "data-model-files";

/**
 * Per-type shape of `DataField.config` — what an admin sets once, in the
 * field editor. Validated on every field create/update.
 */
export const fieldConfigSchemas = {
  TEXT: z.object({
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().max(1000).optional(),
  }),
  LONG_TEXT: z.object({
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().max(20_000).optional(),
  }),
  RICH_TEXT: z.object({}),
  NUMBER: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    integer: z.boolean().optional(),
  }),
  BOOLEAN: z.object({}),
  DATE: z.object({}),
  DATETIME: z.object({}),
  SELECT: z.object({
    options: z
      .array(
        z.object({
          value: z.string().min(1),
          label: z.string().min(1),
          color: z.string().optional(),
        }),
      )
      .min(1)
      .max(50),
  }),
  MULTI_SELECT: z.object({
    options: z
      .array(
        z.object({
          value: z.string().min(1),
          label: z.string().min(1),
          color: z.string().optional(),
        }),
      )
      .min(1)
      .max(50),
    // Notion-style "type to add a new option" — lets a free-typed-tag field
    // (e.g. Project.keywords) migrate without forcing a fixed option list.
    allowCustomValues: z.boolean().optional(),
    max: z.number().int().min(1).optional(),
  }),
  RELATION: z.object({
    // A DataModel.key, or a fixed system-model key (e.g. "Calendar").
    relationTarget: z.string().min(1),
    relationTargetKind: z.enum(["DATA_MODEL", "SYSTEM_MODEL"]),
    cardinality: z.enum(["ONE", "MANY"]),
    max: z.number().int().min(1).optional(),
  }),
  URL: z.object({ maxLength: z.number().int().max(2000).optional() }),
  EMAIL: z.object({ maxLength: z.number().int().max(320).optional() }),
  // A computed, read-only field. `expression` is validated for *syntax* here ;
  // reference resolution + cycle detection (which need the model's other
  // fields) happen server-side in `server/data.ts`. The value is never taken
  // from client input — it's computed on write from the record's own data.
  // The result *type* isn't configured : it's derived from the expression by
  // `inferResultType` (an explicit `toNumber()` / `toText()` / … cast is the
  // override), so a formula never carries a redundant, drift-prone type field.
  FORMULA: z.object({
    expression: z.string().trim().min(1).max(2000),
  }),
  // A single uploaded file. The stored value is a `StoredFile.id` soft
  // reference (like RELATION ONE) ; `allowedFormats` are MIME types (exact,
  // e.g. "application/pdf", or a wildcard prefix like "image/*") and
  // `maxSizeBytes` caps a file's size — both enforced server-side against the
  // resolved `StoredFile` on record write (the value schema only checks the
  // id shape).
  FILE: z.object({
    allowedFormats: z.array(z.string().min(1)).optional(),
    maxSizeBytes: z.number().int().min(1).optional(),
  }),
  // A bucket of many uploaded files. Stored value is `StoredFile.id[]` (like
  // RELATION MANY / MULTI_SELECT) ; `max` caps the count.
  ATTACHMENTS: z.object({
    allowedFormats: z.array(z.string().min(1)).optional(),
    maxSizeBytes: z.number().int().min(1).optional(),
    max: z.number().int().min(1).optional(),
  }),
} as const satisfies Record<DataFieldType, z.ZodTypeAny>;

export type FieldConfig<T extends DataFieldType> = z.infer<(typeof fieldConfigSchemas)[T]>;

/**
 * Structural facts about one field needed to build its *value* schema — a
 * type plus the subset of its config that affects validation, plus whether
 * it's required. Deliberately narrower than the full `config` shapes above
 * (those describe what an admin configures ; this is just what
 * {@link valueSchemaFor} needs to read). Both the client `FieldDef` (see
 * `services/web/src/components/fields/types.ts`) and a server `DataField`
 * row map onto this same shape, which is what lets {@link valueSchemaFor}
 * be the *one* validation implementation both sides share.
 */
export interface DataFieldValueShape {
  type: DataFieldType;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  /** MULTI_SELECT max selections, or RELATION max ids when `multiple`. */
  maxItems?: number;
  /** RELATION only : stores an array of ids and renders chips when true. */
  multiple?: boolean;
}

/**
 * Optional message overrides — each key omitted falls back to zod's built-in
 * default message. The server calls {@link valueSchemaFor} with none (a
 * validation failure there is a 400, never shown verbatim to a user) ; the
 * client fields toolkit passes its localized `FieldMessages` (structurally
 * compatible with this interface, since every one of its keys is required
 * there and optional here).
 */
export interface ValueSchemaMessages {
  required?: string;
  invalidUrl?: string;
  invalidEmail?: string;
  tooShort?: (min: number) => string;
  tooLong?: (max: number) => string;
  tooSmall?: (min: number) => string;
  tooLarge?: (max: number) => string;
  notInteger?: string;
  tooManyItems?: (max: number) => string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Rough tag strip. Used to validate that rich-text isn't visually empty, and
 * reused by `server/records.ts` to derive a plain-text `DataRecord.title`
 * when the model's title field is RICH_TEXT.
 */
export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Builds the zod fragment that validates one field's value. The single
 * source of truth for both the tRPC record-write input (server) and the
 * dynamic form's resolver (client) — see docs/features-planning/phase-2/
 * polymorphic-db.md, "Field-type system". Ported from the pre-existing
 * client-only `schemaFor` in `services/web/src/components/fields/schema.ts`,
 * split at the one seam that makes it shareable : this emits structural zod
 * only, with i18n messages as an optional overlay rather than a hard
 * requirement.
 */
export function valueSchemaFor(
  def: DataFieldValueShape,
  m: ValueSchemaMessages = {},
): z.ZodTypeAny {
  switch (def.type) {
    case "TEXT":
    case "LONG_TEXT": {
      let s = z.string();
      if (def.maxLength != null) s = s.max(def.maxLength, m.tooLong?.(def.maxLength));
      if (def.required) {
        const min = def.minLength && def.minLength > 1 ? def.minLength : 1;
        return s.min(min, min > 1 ? m.tooShort?.(min) : m.required);
      }
      if (def.minLength != null) {
        const min = def.minLength;
        return s.refine((v) => v.length === 0 || v.length >= min, m.tooShort?.(min));
      }
      return s;
    }

    case "RICH_TEXT": {
      const s = z.string();
      return def.required ? s.refine((v) => stripHtmlTags(v).trim().length > 0, m.required) : s;
    }

    case "URL": {
      let s = z.string();
      if (def.maxLength != null) s = s.max(def.maxLength, m.tooLong?.(def.maxLength));
      const withUrl = s.refine((v) => v === "" || isHttpUrl(v), m.invalidUrl);
      return def.required
        ? s.min(1, m.required).refine((v) => isHttpUrl(v), m.invalidUrl)
        : withUrl;
    }

    case "EMAIL": {
      let s = z.string();
      if (def.maxLength != null) s = s.max(def.maxLength, m.tooLong?.(def.maxLength));
      const withEmail = s.refine((v) => v === "" || EMAIL_RE.test(v), m.invalidEmail);
      return def.required
        ? s.min(1, m.required).refine((v) => EMAIL_RE.test(v), m.invalidEmail)
        : withEmail;
    }

    case "NUMBER": {
      let n = z.number({ invalid_type_error: m.required });
      if (def.integer) n = n.int(m.notInteger);
      if (def.min != null) n = n.min(def.min, m.tooSmall?.(def.min));
      if (def.max != null) n = n.max(def.max, m.tooLarge?.(def.max));
      return def.required ? n : n.nullable();
    }

    case "BOOLEAN":
      return z.boolean();

    case "DATE":
    case "DATETIME": {
      // The client's form state holds real `Date` objects (from a date
      // picker) ; the server re-reads `DataRecord.data` out of JSONB, where
      // a Date only ever survives as its ISO string (JSON has no Date
      // type). Preprocessing normalizes either input into a `Date` before
      // the inner check, so both sides validate — and get back — an
      // actual `Date` instance, not a mix of the two.
      const inner = def.required ? z.date({ invalid_type_error: m.required }) : z.date().nullable();
      return z.preprocess((v) => {
        if (v instanceof Date) return v;
        if (typeof v === "string" || typeof v === "number") {
          const parsed = new Date(v);
          return Number.isNaN(parsed.getTime()) ? v : parsed;
        }
        return v;
      }, inner);
    }

    case "SELECT":
      return def.required
        ? z.string({ invalid_type_error: m.required }).min(1, m.required)
        : z.string().nullable();

    case "MULTI_SELECT": {
      let a = z.array(z.string());
      if (def.maxItems != null) a = a.max(def.maxItems, m.tooManyItems?.(def.maxItems));
      return def.required ? a.min(1, m.required) : a;
    }

    case "RELATION": {
      if (def.multiple) {
        let a = z.array(z.string());
        if (def.maxItems != null) a = a.max(def.maxItems, m.tooManyItems?.(def.maxItems));
        return def.required ? a.min(1, m.required) : a;
      }
      return def.required
        ? z.string({ invalid_type_error: m.required }).min(1, m.required)
        : z.string().nullable();
    }

    case "FORMULA":
      // Computed server-side, never accepted from client input (the record
      // write schema drops FORMULA keys and recomputes them). Any stored
      // value is tolerated on the way back out.
      return z.unknown();

    case "FILE":
      // A single `StoredFile.id` (soft ref) — same shape as SELECT / RELATION
      // ONE. Format/size are checked server-side against the resolved file.
      return def.required
        ? z.string({ invalid_type_error: m.required }).min(1, m.required)
        : z.string().nullable();

    case "ATTACHMENTS": {
      // An array of `StoredFile.id` — same shape as MULTI_SELECT / RELATION MANY.
      let a = z.array(z.string());
      if (def.maxItems != null) a = a.max(def.maxItems, m.tooManyItems?.(def.maxItems));
      return def.required ? a.min(1, m.required) : a;
    }
  }
}

/**
 * Server-facing entry point : validates a `DataField` row's persisted
 * `config` against its type's config schema, then builds the value schema
 * for it. `packages/data-models/src/server/records.ts` calls this once per
 * active field to assemble a record-write input's full zod object.
 */
export function valueSchemaForField(
  type: DataFieldType,
  config: unknown,
  required: boolean,
  m: ValueSchemaMessages = {},
): z.ZodTypeAny {
  const parsed = fieldConfigSchemas[type].parse(config) as Record<string, unknown>;
  const numOrUndef = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
  const shape: DataFieldValueShape = {
    type,
    required,
    minLength: numOrUndef(parsed.minLength),
    maxLength: numOrUndef(parsed.maxLength),
    min: numOrUndef(parsed.min),
    max: type === "NUMBER" ? numOrUndef(parsed.max) : undefined,
    integer: typeof parsed.integer === "boolean" ? parsed.integer : undefined,
    maxItems:
      type === "MULTI_SELECT" || type === "RELATION" || type === "ATTACHMENTS"
        ? numOrUndef(parsed.max)
        : undefined,
    multiple:
      type === "RELATION"
        ? parsed.cardinality === "MANY"
        : type === "ATTACHMENTS"
          ? true
          : undefined,
  };
  return valueSchemaFor(shape, m);
}
