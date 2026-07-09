import type { DataColumnDef, SortAccessor } from "@/components/patterns";
import { renderFieldValue, type CellLabels } from "./cells";
import { FIELD_TYPE_ICON, type FieldIcon } from "./field-icons";
import { FIELD_TYPE_META } from "./registry";
import { htmlToText } from "./rich-text";
import type { FieldDef, RelationOption } from "./types";

/** Derives a type-appropriate sort key from a field's raw cell value. */
function deriveSortAccessor<TData>(
  def: FieldDef,
  accessor: (row: TData) => unknown,
): SortAccessor<TData> {
  return (row) => {
    const value = accessor(row);
    if (value == null) return null;
    switch (def.type) {
      case "number":
        return value as number;
      case "boolean":
        return value ? 1 : 0;
      case "date":
      case "datetime":
        return value instanceof Date ? value : new Date(value as string);
      case "singleSelect": {
        const opt = def.options.find((o) => o.value === value);
        return opt?.label ?? String(value);
      }
      case "richText":
        return htmlToText(value as string);
      case "multiSelect":
        return (value as string[]).length;
      case "relation":
        return Array.isArray(value)
          ? (value as RelationOption[]).length
          : ((value as RelationOption | null)?.label ?? null);
      case "formula":
        // Sort a computed column by its declared result type, not blindly as
        // text (so a numeric formula orders numerically).
        return def.resultType === "number"
          ? (value as number)
          : def.resultType === "date"
            ? value instanceof Date
              ? value
              : new Date(value as string)
            : def.resultType === "boolean"
              ? value
                ? 1
                : 0
              : String(value);
      default:
        return String(value);
    }
  };
}

export interface FieldColumnOptions<TData> {
  /** Pulls this field's value out of a row (already-resolved for relations). */
  accessor: (row: TData) => unknown;
  /** Cell chrome strings (empty / yes / no / more). */
  labels: CellLabels;
  /** Overrides the column header (defaults to `def.label`). */
  header?: string;
  /** Overrides the type glyph before the header (`null` hides it entirely;
   *  defaults to the field type's icon). */
  headerIcon?: FieldIcon | null;
  /** Overrides the derived alignment. */
  align?: "left" | "right";
  /** Enables sorting (on by default). */
  enableSorting?: boolean;
  enableHiding?: boolean;
  size?: number;
  minSize?: number;
}

/**
 * Builds a {@link DataColumnDef} for a field def, wiring the typed cell
 * renderer, a type-appropriate sort accessor, and alignment. Lets a
 * polymorphic table assemble all its columns straight from field defs.
 */
export function fieldColumn<TData>(
  def: FieldDef,
  opts: FieldColumnOptions<TData>,
): DataColumnDef<TData> {
  const meta = FIELD_TYPE_META[def.type];
  // `undefined` → default to the type glyph ; `null` → explicitly hide it.
  const headerIcon =
    opts.headerIcon === undefined ? FIELD_TYPE_ICON[def.type] : (opts.headerIcon ?? undefined);
  return {
    id: def.name,
    header: opts.header ?? def.label,
    headerIcon,
    cell: (row) => renderFieldValue(def, opts.accessor(row), opts.labels),
    align: opts.align ?? meta.align,
    enableSorting: opts.enableSorting ?? true,
    sortAccessor: deriveSortAccessor(def, opts.accessor),
    enableHiding: opts.enableHiding,
    size: opts.size,
    minSize: opts.minSize,
  };
}
