import type { ComponentType } from "react";
import {
  AlignLeft,
  AtSign,
  Calendar,
  CalendarClock,
  CircleDot,
  FileText,
  FunctionSquare,
  Hash,
  Link,
  Paperclip,
  Pilcrow,
  Tags,
  ToggleLeft,
  Type,
  Waypoints,
} from "lucide-react";
import type { FieldType } from "./types";

/** A field-type glyph — sized by the caller via `className`. */
export type FieldIcon = ComponentType<{ className?: string }>;

/**
 * Maps each field type to a lucide glyph that connotes its data type. Shown
 * before a field's label in forms ({@link FieldRow}) and table headers
 * ({@link DataColumnDef.headerIcon}) so a reader can tell short text from a
 * select from a URL at a glance. Kept beside {@link FIELD_TYPE_META} as part
 * of the field descriptor's presentation contract.
 */
export const FIELD_TYPE_ICON: Record<FieldType, FieldIcon> = {
  text: Type, // short text
  longText: AlignLeft, // multi-line text
  richText: Pilcrow, // WYSIWYG
  document: FileText, // block editor (Notion-style)
  number: Hash,
  boolean: ToggleLeft, // switch / checkbox
  date: Calendar,
  datetime: CalendarClock,
  singleSelect: CircleDot, // one-of (radio-like)
  multiSelect: Tags, // many-of (chips)
  relation: Waypoints, // reference to other records
  file: Paperclip, // uploaded file(s)
  url: Link,
  email: AtSign,
  formula: FunctionSquare, // computed expression
};
