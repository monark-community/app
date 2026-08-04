import type { DataFieldType } from "./field-types";
import { inferResultType, type FormulaResultType } from "./formula";
import type { FilterableKind } from "@monark/query/contracts";

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
