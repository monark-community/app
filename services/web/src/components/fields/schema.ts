import { z } from "zod";
import { valueSchemaFor, type DataFieldValueShape } from "@monark/data-models/contracts";
import type { FieldDef, FieldMessages } from "./types";

// FieldDef -> DataFieldType, and its structural properties -> the shared
// DataFieldValueShape. This is the client-side half of the one-implementation
// rule described in docs/features-planning/phase-2/polymorphic-db.md
// ("Field-type system") : the actual zod-building logic now lives once, in
// @monark/data-models/contracts, shared with the server's record-write
// input. `FieldMessages` is structurally assignable to `ValueSchemaMessages`
// (every key here is required ; there, optional), so it passes through as-is.
function toValueShape(def: FieldDef): DataFieldValueShape {
  switch (def.type) {
    case "text":
      return {
        type: "TEXT",
        required: def.required,
        minLength: def.minLength,
        maxLength: def.maxLength,
      };
    case "longText":
      return {
        type: "LONG_TEXT",
        required: def.required,
        minLength: def.minLength,
        maxLength: def.maxLength,
      };
    case "richText":
      return { type: "RICH_TEXT", required: def.required };
    case "url":
      return { type: "URL", required: def.required, maxLength: def.maxLength };
    case "email":
      return { type: "EMAIL", required: def.required, maxLength: def.maxLength };
    case "number":
      return {
        type: "NUMBER",
        required: def.required,
        min: def.min,
        max: def.max,
        integer: def.integer,
      };
    case "boolean":
      return { type: "BOOLEAN" };
    case "date":
      return { type: "DATE", required: def.required };
    case "datetime":
      return { type: "DATETIME", required: def.required };
    case "singleSelect":
      return { type: "SELECT", required: def.required };
    case "multiSelect":
      return { type: "MULTI_SELECT", required: def.required, maxItems: def.max };
    case "relation":
      return {
        type: "RELATION",
        required: def.required,
        multiple: def.multiple,
        maxItems: def.multiple ? def.max : undefined,
      };
    case "formula":
      // Computed + read-only : never required, value not user-supplied. The
      // shared builder returns a permissive schema for FORMULA (the server
      // strips + recomputes it anyway).
      return { type: "FORMULA", required: false };
  }
}

/** Builds the zod fragment that validates one field's form value. */
export function schemaFor(def: FieldDef, m: FieldMessages): z.ZodTypeAny {
  return valueSchemaFor(toValueShape(def), m);
}

/** Assembles the object schema for a whole form from its field defs. */
export function schemaForFields(
  fields: FieldDef[],
  messages: FieldMessages,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  return z.object(Object.fromEntries(fields.map((def) => [def.name, schemaFor(def, messages)])));
}
