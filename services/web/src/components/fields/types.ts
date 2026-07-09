import type { BadgeProps } from "@/components/ui/badge";

/**
 * Field descriptors — the single source of truth that drives both the
 * form inputs (`inputs/*`) and the table cell renderers (`cells.tsx`).
 * A polymorphic Data Model field maps 1:1 onto one of these `FieldDef`
 * variants ; the registry (`registry.tsx`) turns a `FieldDef` into its
 * input, cell, and zod fragment.
 *
 * Everything here is presentation-agnostic and text-free : `label`,
 * `description`, `placeholder`, and option `label`s are already
 * translated by the caller (the i18n rule keeps these components
 * text-free ; internal chrome comes through {@link FieldLabels}).
 */

/** Badge tone reused for select / relation cells (mirrors `Badge` variants). */
export type BadgeTone = NonNullable<BadgeProps["variant"]>;

/**
 * The tones an admin can assign to a SELECT / MULTI_SELECT option in the
 * schema builder (the swatch palette). `secondary` leads as the neutral
 * default — a field with no colored options renders its options as plain
 * text ; assigning any non-neutral tone flips the field to colored badges.
 */
export const SELECT_OPTION_TONES = [
  "secondary",
  "primary",
  "success",
  "warning",
  "destructive",
  "outline",
] as const satisfies readonly BadgeTone[];

/** One choice in a single/multi-select field. `label` is already translated. */
export interface SelectOption {
  value: string;
  label: string;
  /** Optional badge tone used when this value renders in a table cell. */
  tone?: BadgeTone;
}

/** A resolved relation target (a row in another Data Model / system model). */
export interface RelationOption {
  id: string;
  label: string;
  /** Secondary line shown under the label in the picker / chip. */
  sublabel?: string;
  /** Avatar image URL ; falls back to initials when absent (see `avatars`). */
  avatarUrl?: string;
}

/**
 * Async data source for a relation field. The caller wires these to a
 * tRPC query (search + hydrate) ; the field never knows the transport.
 */
export interface RelationSource {
  /** Target Data Model id, or a fixed system-model key (e.g. "user"). */
  model: string;
  /** Search options for a query ; an empty query returns the first page. */
  loadOptions: (query: string) => Promise<RelationOption[]>;
  /** Resolve already-selected ids back to options (to label the chips). */
  loadByIds: (ids: string[]) => Promise<RelationOption[]>;
}

interface BaseFieldDef {
  /** Form key ; also the record field name. */
  name: string;
  /** Translated field label. */
  label: string;
  /** Translated help text under the control. */
  description?: string;
  /** Translated placeholder. */
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

export interface TextFieldDef extends BaseFieldDef {
  type: "text";
  minLength?: number;
  maxLength?: number;
}

export interface LongTextFieldDef extends BaseFieldDef {
  type: "longText";
  minLength?: number;
  maxLength?: number;
  rows?: number;
}

export interface RichTextFieldDef extends BaseFieldDef {
  type: "richText";
  /** Min editor height in Tailwind spacing units (default 32 = h-32). */
  minHeight?: number;
}

export interface NumberFieldDef extends BaseFieldDef {
  type: "number";
  min?: number;
  max?: number;
  step?: number;
  /** Reject non-integers. */
  integer?: boolean;
  /** Static affix rendered inside the input (e.g. "$", "%"). */
  prefix?: string;
  suffix?: string;
}

export interface BooleanFieldDef extends BaseFieldDef {
  type: "boolean";
  /** "switch" (default, settings-style) or "checkbox". */
  control?: "switch" | "checkbox";
}

export interface DateFieldDef extends BaseFieldDef {
  type: "date";
  min?: Date;
  max?: Date;
}

export interface DatetimeFieldDef extends BaseFieldDef {
  type: "datetime";
  min?: Date;
  max?: Date;
}

export interface SingleSelectFieldDef extends BaseFieldDef {
  type: "singleSelect";
  options: SelectOption[];
  /** Force the searchable combobox regardless of option count. */
  searchable?: boolean;
  /** Pick the control explicitly ; defaults to auto (select / combobox). */
  variant?: "select" | "combobox" | "radio";
  /** Render options / value as colored `Badge`s (uses each option's `tone`). */
  badges?: boolean;
}

export interface MultiSelectFieldDef extends BaseFieldDef {
  type: "multiSelect";
  options: SelectOption[];
  /** Allow adding free-text values not present in `options`. */
  allowCustom?: boolean;
  /** Cap the number of selected values. */
  max?: number;
  /** Render options / chips as colored `Badge`s (uses each option's `tone`). */
  badges?: boolean;
}

export interface RelationFieldDef extends BaseFieldDef {
  type: "relation";
  source: RelationSource;
  /** When true the field stores an array of ids and renders chips. */
  multiple?: boolean;
  /** Cap the number of selected relations (only when `multiple`). */
  max?: number;
  /** Show an avatar (image or initials) beside each option / chip / cell. */
  avatars?: boolean;
}

/** The scalar type a formula computes to — drives cell + read-view formatting. */
export type FormulaResultType = "text" | "number" | "boolean" | "date";

export interface FormulaFieldDef extends BaseFieldDef {
  type: "formula";
  /** The formula expression (see `@monark/data-models/contracts` formula.ts). */
  expression: string;
  /** How the computed value renders (number is right-aligned + tabular, etc.). */
  resultType: FormulaResultType;
}

export interface UrlFieldDef extends BaseFieldDef {
  type: "url";
  maxLength?: number;
}

export interface EmailFieldDef extends BaseFieldDef {
  type: "email";
  maxLength?: number;
}

export type FieldDef =
  | TextFieldDef
  | LongTextFieldDef
  | RichTextFieldDef
  | NumberFieldDef
  | BooleanFieldDef
  | DateFieldDef
  | DatetimeFieldDef
  | SingleSelectFieldDef
  | MultiSelectFieldDef
  | RelationFieldDef
  | UrlFieldDef
  | EmailFieldDef
  | FormulaFieldDef;

export type FieldType = FieldDef["type"];

/**
 * The runtime value a field holds in form state. Kept intentionally
 * loose (the registry's zod schema is the real contract) ; callers get
 * precise types from their own zod-inferred payload.
 */
export type FieldValue = string | string[] | number | boolean | Date | null;

/** The empty / initial value for a field, used to seed `defaultValues`. */
export function defaultValueFor(def: FieldDef): FieldValue {
  switch (def.type) {
    case "text":
    case "longText":
    case "richText":
    case "url":
    case "email":
      return "";
    case "number":
      return null;
    case "boolean":
      return false;
    case "date":
    case "datetime":
      return null;
    case "singleSelect":
      return null;
    case "multiSelect":
      return [];
    case "relation":
      return def.multiple ? [] : null;
    case "formula":
      // Computed + read-only ; server recomputes on write. Seeded null so the
      // key exists in form state (the live preview reads sibling values).
      return null;
  }
}

// ── Internal chrome strings (text-free rule → passed in, not hardcoded) ──

/** Chrome text used inside the field controls (see `useFieldStrings`). */
export interface FieldLabels {
  /** Combobox empty state. */
  noResults: string;
  /** Generic combobox search placeholder (field `placeholder` overrides). */
  searchPlaceholder: string;
  /** multiSelect `allowCustom` create row ; receives the typed value. */
  createOption: (value: string) => string;
  /** Clear-value action (date / select). */
  clear: string;
  /** Date / datetime trigger label when empty. */
  pickDate: string;
  /** Character counter ; receives current length + max. */
  charCount: (count: number, max: number) => string;
  /** multiSelect / relation trigger when nothing is selected. */
  selectPlaceholder: string;
  /** Add-value button (multiSelect / relation chips). */
  add: string;
  /** Relation async loading label. */
  loading: string;
  /** Remove-chip aria-label ; receives the chip label. */
  remove: (label: string) => string;
  /** Boolean cell / read view. */
  yes: string;
  no: string;
  /** Empty value placeholder in a cell. */
  empty: string;
  /** Overflow chip in multi-value cells ; receives the hidden count. */
  more: (count: number) => string;
  /** Rich-text editor toolbar button labels. */
  richText: RichTextToolbarLabels;
}

/** aria-labels / tooltips for the rich-text editor toolbar. */
export interface RichTextToolbarLabels {
  bold: string;
  italic: string;
  strike: string;
  code: string;
  heading1: string;
  heading2: string;
  heading3: string;
  heading4: string;
  paragraph: string;
  /** aria-label for the heading / text-style dropdown trigger. */
  textStyle: string;
  bulletList: string;
  orderedList: string;
  blockquote: string;
  link: string;
  unlink: string;
  linkUrlPlaceholder: string;
  linkApply: string;
}

/** Validation messages fed into the registry's zod fragments. */
export interface FieldMessages {
  required: string;
  invalidUrl: string;
  invalidEmail: string;
  tooShort: (min: number) => string;
  tooLong: (max: number) => string;
  tooSmall: (min: number) => string;
  tooLarge: (max: number) => string;
  notInteger: string;
  tooManyItems: (max: number) => string;
}

export interface FieldStrings {
  labels: FieldLabels;
  messages: FieldMessages;
}

/** Props every form-input component in `inputs/*` accepts. */
export interface FieldInputProps<D extends FieldDef = FieldDef> {
  def: D;
  labels: FieldLabels;
}
