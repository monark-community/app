import type { DataFieldType } from "./field-types";
import { inferResultType, type FormulaResultType } from "./formula";
import { group, leaf } from "@monark/query/contracts";
import type { FilterableKind, FilterNode } from "@monark/query/contracts";

/**
 * Data-Model adapter over the shared query language (`@monark/query`). The
 * generic AST / operators / text-DSL / `@variables` live in `@monark/query`
 * (isomorphic, schema-agnostic) and are re-exported here so existing
 * `@monark/data-models/contracts` imports keep resolving. The only Data-Model-
 * specific piece is the bridge from a `DataFieldType` (incl. `FORMULA`, via its
 * inferred result type) to a {@link FilterableKind}.
 */
export * from "@monark/query/contracts";

const KIND_BY_TYPE: Partial<Record<DataFieldType, FilterableKind>> = {
  TEXT: "text",
  LONG_TEXT: "text",
  RICH_TEXT: "text",
  URL: "text",
  EMAIL: "text",
  NUMBER: "number",
  BOOLEAN: "boolean",
  DATE: "date",
  DATETIME: "date",
  SELECT: "select",
  MULTI_SELECT: "multiSelect",
  RELATION: "relation",
  FILE: "attachments",
  ATTACHMENTS: "attachments",
  // FORMULA resolves through its inferred result type — see filterableKindOf.
};

const KIND_BY_FORMULA_RESULT: Record<FormulaResultType, FilterableKind> = {
  TEXT: "text",
  NUMBER: "number",
  BOOLEAN: "boolean",
  DATE: "date",
};

/**
 * The {@link FilterableKind} a Data-Model field filters as. A `FORMULA` field
 * filters as whatever its expression yields (typed by {@link inferResultType}) ;
 * pass its `expression` so we can resolve it. Returns `null` for a type with no
 * sensible filter. A malformed formula expression degrades to `text`.
 */
export function filterableKindOf(
  type: DataFieldType,
  opts?: { formulaExpression?: string },
): FilterableKind | null {
  if (type === "FORMULA") {
    const expr = opts?.formulaExpression;
    if (!expr) return "text";
    try {
      return KIND_BY_FORMULA_RESULT[inferResultType(expr)];
    } catch {
      return "text";
    }
  }
  return KIND_BY_TYPE[type] ?? null;
}

/** Build a `FieldKinds` map from Data-Model field rows, resolving `FORMULA`
 *  through its result type. The Data-Model counterpart to the shared, kind-based
 *  `fieldKindsFrom`. */
export function fieldKindsFromDataFields(
  fields: Array<{ key: string; type: DataFieldType; formulaExpression?: string }>,
): Map<string, FilterableKind> {
  const map = new Map<string, FilterableKind>();
  for (const f of fields) {
    const kind = filterableKindOf(f.type, { formulaExpression: f.formulaExpression });
    if (kind) map.set(f.key, kind);
  }
  return map;
}

// ── Legacy filter-menu bridge ────────────────────────────

/** A single field-value predicate from the records list filter menu. `value` is
 *  the raw filter-control value : a string for text / number / boolean / date /
 *  select, or a `string[]` for `selectAny` / multi-select.
 *
 *  This is the **legacy** flat shape. It is kept as the wire input for the
 *  classic filter menu, but it no longer has its own execution path ; it is
 *  translated to a {@link FilterNode} by {@link fieldFiltersToFilterNode} and
 *  run through the one compiler. Prefer sending a `filter` tree directly. */
export type RecordFieldFilter = {
  /** The `DataField.key` to filter on (the JSONB `data` object's key). */
  key: string;
  type: "text" | "number" | "boolean" | "date" | "select" | "selectAny" | "multiSelect";
  value: string | string[];
};

/** Translate one legacy filter-menu predicate into a query leaf. Returns `null`
 *  for a neutral / empty value so it composes out of the `AND` (matching the
 *  old `fieldFilterWhere` behavior, which returned a null `where` fragment). */
function leafForFieldFilter(f: RecordFieldFilter): FilterNode | null {
  const asString = typeof f.value === "string" ? f.value.trim() : "";
  const asArray = (Array.isArray(f.value) ? f.value : [f.value]).filter((v) => v !== "");

  switch (f.type) {
    // Text was a case-SENSITIVE `string_contains` ; `contains` compiles to
    // ILIKE, so this is now case-insensitive. A deliberate improvement.
    case "text":
      return asString ? leaf(f.key, "contains", asString) : null;
    // Date was also a substring match on the stored ISO string ; `is` compiles
    // to `::date = ::date`, so it now matches the calendar day properly.
    case "date":
      return asString ? leaf(f.key, "is", asString) : null;
    case "number":
      return asString !== "" && Number.isFinite(Number(asString))
        ? leaf(f.key, "eq", asString)
        : null;
    case "boolean":
      if (asString === "true") return leaf(f.key, "isTrue");
      if (asString === "false") return leaf(f.key, "isFalse");
      return null;
    // A single-select stores a scalar ; one chosen value or several are both
    // "is any of".
    case "select":
      return asString ? leaf(f.key, "isAnyOf", [asString]) : null;
    case "selectAny":
      return asArray.length > 0 ? leaf(f.key, "isAnyOf", asArray) : null;
    // A multi-select stores an array ; the menu's semantic was "contains any
    // of the chosen values".
    case "multiSelect":
      return asArray.length > 0 ? leaf(f.key, "hasAnyOf", asArray) : null;
  }
}

/**
 * Translate the legacy flat `fieldFilters` list into a single `AND` query tree,
 * so the classic filter menu and the query bar share one execution path (the
 * raw-SQL compiler) instead of two independent implementations of the same
 * filter. Returns `undefined` when nothing survives translation, so the caller
 * can run an unfiltered list.
 *
 * Semantics are preserved except for two deliberate improvements, both of which
 * only ever match *more* rows: text matching becomes case-insensitive, and date
 * matching becomes a real same-calendar-day comparison rather than a substring
 * match on the stored ISO string.
 */
export function fieldFiltersToFilterNode(
  filters: readonly RecordFieldFilter[] | undefined,
): FilterNode | undefined {
  if (!filters || filters.length === 0) return undefined;
  const children = filters.map(leafForFieldFilter).filter((n): n is FilterNode => n !== null);
  if (children.length === 0) return undefined;
  return children.length === 1 && children[0] ? children[0] : group("and", children);
}
