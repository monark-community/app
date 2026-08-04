import { Prisma } from "@monark/db";
import { ValidationError } from "@monark/common";
import type { DataFieldType } from "../contracts/field-types";
import {
  filterableKindOf,
  isOpLegal,
  isQueryVariable,
  resolveQueryVariable,
  type FilterLeaf,
  type FilterNode,
  type QueryContext,
} from "../contracts/query";

/**
 * Compiles a {@link FilterNode} query tree to a boolean `Prisma.Sql` fragment
 * over the `DataRecord.data` JSONB column, for use inside a `$queryRaw` WHERE.
 *
 * Raw SQL (not Prisma's structured JSON `where`) on purpose, for two reasons:
 *  1. Case-insensitive text needs `ILIKE`, which the structured JSON filter has
 *     no `mode` for.
 *  2. The opt-in per-field indexes in `indexing.ts` are **expression** indexes —
 *     `((data->>'key')::numeric)`, `::timestamptz`, GIN on `data->'key'`. Only a
 *     query written against the *same* expressions can use them ; Prisma's
 *     `data: { path, gt }` form generates a different extraction and misses them.
 *
 * Field keys are interpolated as identifiers (Postgres can't bind a json path
 * key), which is safe because a `DataField.key` is validated once at creation
 * against {@link SAFE_KEY_RE} and is immutable thereafter (same guarantee
 * `indexing.ts` relies on to build raw DDL). Every *value* is bound as a
 * parameter, never interpolated. A guard here re-checks the key defensively.
 */

// Mirror of the field-key shape enforced at create time (see indexing.ts).
const SAFE_KEY_RE = /^[a-z][a-z0-9_]*$/;

/** What the compiler needs to know about one filterable field. Built by the
 *  caller from the model's `DataField` rows. */
export interface CompileFieldMeta {
  type: DataFieldType;
  /** FORMULA only : its expression, so the compiler can resolve the result
   *  type it filters as. */
  formulaExpression?: string;
  /** True when the stored value is a JSON array — MULTI_SELECT, ATTACHMENTS,
   *  and RELATION with cardinality MANY. Drives array vs scalar SQL for
   *  membership + empty checks. */
  arrayValued?: boolean;
}

export type CompileFields = Map<string, CompileFieldMeta>;

// ── value extraction (values arrive string-encoded on the wire) ──

// Swap a `@variable` for its concrete value against the query context ; a bare
// value passes through. An unknown variable — or a variable with no context —
// is a user-facing 400.
function resolveVal(v: string, ctx: QueryContext | undefined): string {
  if (!isQueryVariable(v)) return v;
  const resolved = ctx ? resolveQueryVariable(v, ctx) : null;
  if (resolved === null) throw new ValidationError(`Unknown variable "${v}".`);
  return resolved;
}

function scalarOf(leaf: FilterLeaf, ctx: QueryContext | undefined): string {
  const v = leaf.value;
  if (typeof v !== "string") {
    throw new ValidationError(`Operator "${leaf.op}" expects a single value.`);
  }
  return resolveVal(v, ctx);
}

function listOf(leaf: FilterLeaf, ctx: QueryContext | undefined): string[] {
  const v = leaf.value;
  const arr = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return arr.filter((s) => s !== "").map((s) => resolveVal(s, ctx));
}

function pairOf(leaf: FilterLeaf, ctx: QueryContext | undefined): [string, string] {
  const v = leaf.value;
  if (!Array.isArray(v) || v.length !== 2 || v[0] === undefined || v[1] === undefined) {
    throw new ValidationError(`Operator "${leaf.op}" expects exactly two values.`);
  }
  return [resolveVal(v[0], ctx), resolveVal(v[1], ctx)];
}

function numberOf(s: string): number {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new ValidationError(`"${s}" is not a number.`);
  return n;
}

function dateOf(s: string): string {
  if (Number.isNaN(Date.parse(s))) throw new ValidationError(`"${s}" is not a date.`);
  return s;
}

// LIKE metacharacters escaped so a user's literal `%` / `_` stays literal
// (default backslash escape char).
function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ── relation traversal targets ──

/** A resolved target for `relationKey.subField` traversal : the related model's
 *  id, its field metadata (to compile the sub-condition), and a role-access
 *  predicate on the aliased target row `t` (so traversal can't leak records the
 *  caller can't read). Built by the router (needs DB + access context). */
export interface RelationTarget {
  dataModelId: string;
  fields: CompileFields;
  roleAccess: Prisma.Sql;
}
export type RelationTargets = Map<string, RelationTarget>;

// ── column expressions (key + root already validated / constant) ──
//
// `root` is the JSONB column expression the leaf reads from : "data" for the
// top-level record, "t.data" for an aliased target row inside a traversal
// EXISTS. It's a compile-time constant, never request input.

/** `<root>->>'key'` — the value extracted as text. */
function textCol(root: string, key: string): Prisma.Sql {
  return Prisma.raw(`${root}->>'${key}'`);
}
/** `<root>->'key'` — the value as a jsonb sub-element (for array ops). */
function elemCol(root: string, key: string): Prisma.Sql {
  return Prisma.raw(`${root}->'${key}'`);
}

const TRUE = Prisma.sql`TRUE`;
const FALSE = Prisma.sql`FALSE`;

function textArray(values: string[]): Prisma.Sql {
  return Prisma.sql`ARRAY[${Prisma.join(values.map((v) => Prisma.sql`${v}`))}]::text[]`;
}

// Membership against an array-valued field via jsonb existence operators
// (`?|` any, `?&` all) — GIN-indexable.
function arrayAnyOf(root: string, key: string, values: string[]): Prisma.Sql {
  return Prisma.sql`${elemCol(root, key)} ?| ${textArray(values)}`;
}
function arrayAllOf(root: string, key: string, values: string[]): Prisma.Sql {
  return Prisma.sql`${elemCol(root, key)} ?& ${textArray(values)}`;
}

function scalarEmpty(root: string, key: string): Prisma.Sql {
  return Prisma.sql`(${textCol(root, key)} IS NULL OR ${textCol(root, key)} = '')`;
}
function arrayEmpty(root: string, key: string): Prisma.Sql {
  return Prisma.sql`(${elemCol(root, key)} IS NULL OR jsonb_typeof(${elemCol(root, key)}) <> 'array' OR jsonb_array_length(${elemCol(root, key)}) = 0)`;
}

// ── leaf compilation ──

function compileLeaf(
  leaf: FilterLeaf,
  fields: CompileFields,
  ctx: QueryContext | undefined,
  root: string,
  targets: RelationTargets | undefined,
): Prisma.Sql {
  const key = leaf.field;
  // A dotted field is a one-level relation traversal (`assignee.name`).
  if (key.includes(".")) return compileTraversal(leaf, fields, ctx, root, targets);

  if (!SAFE_KEY_RE.test(key)) throw new ValidationError(`Unknown or invalid field "${key}".`);
  const meta = fields.get(key);
  if (!meta) throw new ValidationError(`Unknown field "${key}".`);
  const kind = filterableKindOf(meta.type, { formulaExpression: meta.formulaExpression });
  if (!kind) throw new ValidationError(`Field "${key}" is not filterable.`);
  if (!isOpLegal(kind, leaf.op)) {
    throw new ValidationError(`Operator "${leaf.op}" is not valid for field "${key}".`);
  }
  const arrayValued = meta.arrayValued ?? false;

  switch (leaf.op) {
    // presence
    case "isEmpty":
      return arrayValued ? arrayEmpty(root, key) : scalarEmpty(root, key);
    case "isNotEmpty":
      return arrayValued
        ? Prisma.sql`NOT ${arrayEmpty(root, key)}`
        : Prisma.sql`NOT ${scalarEmpty(root, key)}`;

    // boolean
    case "isTrue":
      return Prisma.sql`(${textCol(root, key)})::boolean = true`;
    case "isFalse":
      return Prisma.sql`(${textCol(root, key)})::boolean = false`;

    // equality — text uses case-insensitive string match ; date matches the
    // same calendar day.
    case "is":
      return kind === "date"
        ? Prisma.sql`(${textCol(root, key)})::date = ${dateOf(scalarOf(leaf, ctx))}::date`
        : Prisma.sql`lower(${textCol(root, key)}) = lower(${scalarOf(leaf, ctx)})`;
    case "isNot":
      // NULL is "not x" → keep empty records (IS DISTINCT FROM handles NULL).
      return Prisma.sql`lower(${textCol(root, key)}) IS DISTINCT FROM lower(${scalarOf(leaf, ctx)})`;
    case "contains":
      return Prisma.sql`${textCol(root, key)} ILIKE ${`%${escapeLike(scalarOf(leaf, ctx))}%`}`;
    case "notContains":
      return Prisma.sql`(${textCol(root, key)} IS NULL OR ${textCol(root, key)} NOT ILIKE ${`%${escapeLike(scalarOf(leaf, ctx))}%`})`;
    case "startsWith":
      return Prisma.sql`${textCol(root, key)} ILIKE ${`${escapeLike(scalarOf(leaf, ctx))}%`}`;
    case "endsWith":
      return Prisma.sql`${textCol(root, key)} ILIKE ${`%${escapeLike(scalarOf(leaf, ctx))}`}`;

    // number
    case "eq":
      return Prisma.sql`(${textCol(root, key)})::numeric = ${numberOf(scalarOf(leaf, ctx))}`;
    case "neq":
      return Prisma.sql`(${textCol(root, key)})::numeric IS DISTINCT FROM ${numberOf(scalarOf(leaf, ctx))}`;
    case "gt":
      return Prisma.sql`(${textCol(root, key)})::numeric > ${numberOf(scalarOf(leaf, ctx))}`;
    case "gte":
      return Prisma.sql`(${textCol(root, key)})::numeric >= ${numberOf(scalarOf(leaf, ctx))}`;
    case "lt":
      return Prisma.sql`(${textCol(root, key)})::numeric < ${numberOf(scalarOf(leaf, ctx))}`;
    case "lte":
      return Prisma.sql`(${textCol(root, key)})::numeric <= ${numberOf(scalarOf(leaf, ctx))}`;
    case "between": {
      const [a, b] = pairOf(leaf, ctx);
      if (kind === "date") {
        return Prisma.sql`(${textCol(root, key)})::timestamptz BETWEEN ${dateOf(a)}::timestamptz AND ${dateOf(b)}::timestamptz`;
      }
      return Prisma.sql`(${textCol(root, key)})::numeric BETWEEN ${numberOf(a)} AND ${numberOf(b)}`;
    }

    // date ordering
    case "before":
      return Prisma.sql`(${textCol(root, key)})::timestamptz < ${dateOf(scalarOf(leaf, ctx))}::timestamptz`;
    case "after":
      return Prisma.sql`(${textCol(root, key)})::timestamptz > ${dateOf(scalarOf(leaf, ctx))}::timestamptz`;
    case "onOrBefore":
      return Prisma.sql`(${textCol(root, key)})::timestamptz <= ${dateOf(scalarOf(leaf, ctx))}::timestamptz`;
    case "onOrAfter":
      return Prisma.sql`(${textCol(root, key)})::timestamptz >= ${dateOf(scalarOf(leaf, ctx))}::timestamptz`;

    // set membership
    case "isAnyOf":
    case "hasAnyOf": {
      const vals = listOf(leaf, ctx);
      if (vals.length === 0) return TRUE; // neutral
      if (arrayValued) return arrayAnyOf(root, key, vals);
      return Prisma.sql`${textCol(root, key)} IN (${Prisma.join(vals.map((v) => Prisma.sql`${v}`))})`;
    }
    case "hasAllOf": {
      const vals = listOf(leaf, ctx);
      if (vals.length === 0) return TRUE;
      if (arrayValued) return arrayAllOf(root, key, vals);
      // A scalar field can only "have all of" a single value.
      return vals.length === 1 ? Prisma.sql`${textCol(root, key)} = ${vals[0]}` : FALSE;
    }
    case "isNoneOf":
    case "hasNoneOf": {
      const vals = listOf(leaf, ctx);
      if (vals.length === 0) return TRUE;
      const inSet = arrayValued
        ? arrayAnyOf(root, key, vals)
        : Prisma.sql`${textCol(root, key)} IN (${Prisma.join(vals.map((v) => Prisma.sql`${v}`))})`;
      const emptyExpr = arrayValued ? arrayEmpty(root, key) : scalarEmpty(root, key);
      // none-of includes empty records (they hold none of the values).
      return Prisma.sql`(${emptyExpr} OR NOT (${inSet}))`;
    }
    default: {
      const _exhaustive: never = leaf.op;
      throw new ValidationError(`Unsupported operator "${String(_exhaustive)}".`);
    }
  }
}

// `relationKey.subField op value` → records whose related record satisfies the
// sub-condition. Compiled to an EXISTS over the target model's DataRecords,
// joined by the id(s) stored in the relation value, scoped to the target
// model + its (caller-visible) rows, with the sub-condition compiled against
// the aliased target `t.data`. One level only.
function compileTraversal(
  leaf: FilterLeaf,
  fields: CompileFields,
  ctx: QueryContext | undefined,
  root: string,
  targets: RelationTargets | undefined,
): Prisma.Sql {
  const parts = leaf.field.split(".");
  if (parts.length !== 2) {
    throw new ValidationError(
      `Only one level of relation traversal is supported ("${leaf.field}").`,
    );
  }
  const [relKey, subKey] = parts as [string, string];
  if (!SAFE_KEY_RE.test(relKey) || !SAFE_KEY_RE.test(subKey)) {
    throw new ValidationError(`Invalid field path "${leaf.field}".`);
  }
  const relMeta = fields.get(relKey);
  if (!relMeta || relMeta.type !== "RELATION") {
    throw new ValidationError(`"${relKey}" is not a relation, so it can't be traversed.`);
  }
  const target = targets?.get(relKey);
  if (!target) throw new ValidationError(`Relation "${relKey}" can't be traversed here.`);

  const membership = relMeta.arrayValued
    ? Prisma.sql`(jsonb_typeof(${elemCol(root, relKey)}) = 'array' AND t.id IN (SELECT jsonb_array_elements_text(${elemCol(root, relKey)})))`
    : Prisma.sql`t.id = ${textCol(root, relKey)}`;

  // Compile the sub-condition against the aliased target row. A dotted subKey
  // was already rejected above (parts.length === 2), so no nested traversal.
  const subLeaf: FilterLeaf = { kind: "leaf", field: subKey, op: leaf.op };
  if (leaf.value !== undefined) subLeaf.value = leaf.value;
  const sub = compileLeaf(subLeaf, target.fields, ctx, "t.data", targets);

  return Prisma.sql`EXISTS (SELECT 1 FROM "DataRecord" t WHERE t."dataModelId" = ${target.dataModelId} AND t."deletedAt" IS NULL AND ${membership} AND ${target.roleAccess} AND ${sub})`;
}

// ── tree compilation ──

function compileNode(
  node: FilterNode,
  fields: CompileFields,
  ctx: QueryContext | undefined,
  targets: RelationTargets | undefined,
): Prisma.Sql {
  // The outer record is aliased `r` in `listDataRecordsWithQuery` ; qualify as
  // `r.data` (not bare `data`) so it stays unambiguous inside a traversal
  // EXISTS subquery, where an unqualified `data` would shadow to the inner `t`.
  if (node.kind === "leaf") return compileLeaf(node, fields, ctx, "r.data", targets);
  const parts = node.children.map((c) => compileNode(c, fields, ctx, targets));
  if (parts.length === 0) return node.combinator === "and" ? TRUE : FALSE;
  const sep = node.combinator === "and" ? " AND " : " OR ";
  const joined = Prisma.sql`(${Prisma.join(parts, sep)})`;
  return node.negate ? Prisma.sql`(NOT ${joined})` : joined;
}

/**
 * Compile a full query tree to a boolean `Prisma.Sql` fragment. `ctx` (the
 * caller's id + "now") resolves `@variable` values (`@me`, `@today`, …) — omit
 * it only when the tree is known to hold no variables. `targets` supplies the
 * resolved related models for `relation.subField` traversal (built by the
 * router) — a traversal leaf whose relation isn't in the map is a 400. Throws
 * {@link ValidationError} (HTTP 400) for an unknown field, an operator that
 * isn't legal for the field's type, an unknown/unsupplied variable, or an
 * un-traversable relation — the things zod can't catch at the input boundary
 * because they need the model's field metadata or the request context.
 */
export function compileFilterToSql(
  node: FilterNode,
  fields: CompileFields,
  ctx?: QueryContext,
  targets?: RelationTargets,
): Prisma.Sql {
  return compileNode(node, fields, ctx, targets);
}
