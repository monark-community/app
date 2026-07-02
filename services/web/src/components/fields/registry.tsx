"use client";

import { BooleanField } from "./inputs/boolean-field";
import { DateField, DatetimeField } from "./inputs/date-field";
import { MultiSelectField } from "./inputs/multi-select-field";
import { NumberField } from "./inputs/number-field";
import { RelationField } from "./inputs/relation-field";
import { RichTextField } from "./inputs/rich-text-field";
import { SingleSelectField } from "./inputs/single-select-field";
import { EmailField, LongTextField, TextField, UrlField } from "./inputs/text-fields";
import type { FieldDef, FieldLabels, FieldType } from "./types";

/**
 * The field-type registry — the single seam a polymorphic Data Model
 * field plugs into. `FieldInput` maps a `FieldDef` to its form input ;
 * `schemaFor` (see `schema.ts`) maps it to a zod fragment ; `FieldCell`
 * (see `cells.tsx`) maps it to a table cell. The switch discriminates
 * the union so each branch gets a precisely-typed `def`.
 */
export function FieldInput({ def, labels }: { def: FieldDef; labels: FieldLabels }) {
  switch (def.type) {
    case "text":
      return <TextField def={def} labels={labels} />;
    case "longText":
      return <LongTextField def={def} labels={labels} />;
    case "richText":
      return <RichTextField def={def} labels={labels} />;
    case "number":
      return <NumberField def={def} labels={labels} />;
    case "boolean":
      return <BooleanField def={def} labels={labels} />;
    case "date":
      return <DateField def={def} labels={labels} />;
    case "datetime":
      return <DatetimeField def={def} labels={labels} />;
    case "singleSelect":
      return <SingleSelectField def={def} labels={labels} />;
    case "multiSelect":
      return <MultiSelectField def={def} labels={labels} />;
    case "relation":
      return <RelationField def={def} labels={labels} />;
    case "url":
      return <UrlField def={def} labels={labels} />;
    case "email":
      return <EmailField def={def} labels={labels} />;
  }
}

/** Static per-type metadata for table wiring (alignment, inline edit). */
export interface FieldTypeMeta {
  /** Default cell alignment. */
  align: "left" | "right";
  /** Whether a simple text/number inline `CellEdit` is meaningful. */
  inlineEditable: boolean;
}

export const FIELD_TYPE_META: Record<FieldType, FieldTypeMeta> = {
  text: { align: "left", inlineEditable: true },
  longText: { align: "left", inlineEditable: false },
  richText: { align: "left", inlineEditable: false },
  number: { align: "right", inlineEditable: true },
  boolean: { align: "left", inlineEditable: false },
  date: { align: "left", inlineEditable: false },
  datetime: { align: "left", inlineEditable: false },
  singleSelect: { align: "left", inlineEditable: false },
  multiSelect: { align: "left", inlineEditable: false },
  relation: { align: "left", inlineEditable: false },
  url: { align: "left", inlineEditable: true },
  email: { align: "left", inlineEditable: true },
};
