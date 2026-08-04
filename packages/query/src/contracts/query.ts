import { z } from "zod";

/**
 * The structured query model ("MonarkQL") : a canonical tree of predicate
 * leaves and boolean groups that every editor (a declarative filter menu, a
 * text query bar) reads and writes, and that each consuming module compiles to
 * its own storage query (a Prisma `where`, raw SQL, …). Pure and isomorphic —
 * generic over a {@link FilterableKind} taxonomy, so it knows nothing about any
 * particular schema. Consumers map their own field types onto a `FilterableKind`
 * (e.g. `@monark/data-models` maps its `DataFieldType`, `@monark/kanban` maps
 * its card columns) and supply a per-field compiler.
 */

// ── Operators ────────────────────────────────────────────

/**
 * The full operator vocabulary. Which subset is legal for a given field is
 * decided by {@link legalOps} (keyed by the field's {@link FilterableKind}),
 * and each operator's value arity by {@link opValueArity}. Naming favours the
 * user-facing verb (`contains`, `before`) over a SQL token.
 */
export const FILTER_OPS = [
  // equality / text
  "is",
  "isNot",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  // number
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  // date
  "before",
  "after",
  "onOrBefore",
  "onOrAfter",
  // boolean
  "isTrue",
  "isFalse",
  // select / multi-select / relation (set membership)
  "isAnyOf",
  "isNoneOf",
  "hasAnyOf",
  "hasAllOf",
  "hasNoneOf",
  // presence (any type)
  "isEmpty",
  "isNotEmpty",
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

/** How many values an operator's `value` carries, which drives both the input
 *  schema and the value editor : `none` (unary presence / boolean), `scalar`
 *  (one value), `list` (any number, for set membership), `pair` (exactly two,
 *  for `between`). */
export type OpValueArity = "none" | "scalar" | "list" | "pair";

const OP_ARITY: Record<FilterOp, OpValueArity> = {
  is: "scalar",
  isNot: "scalar",
  contains: "scalar",
  notContains: "scalar",
  startsWith: "scalar",
  endsWith: "scalar",
  eq: "scalar",
  neq: "scalar",
  gt: "scalar",
  gte: "scalar",
  lt: "scalar",
  lte: "scalar",
  between: "pair",
  before: "scalar",
  after: "scalar",
  onOrBefore: "scalar",
  onOrAfter: "scalar",
  isTrue: "none",
  isFalse: "none",
  isAnyOf: "list",
  isNoneOf: "list",
  hasAnyOf: "list",
  hasAllOf: "list",
  hasNoneOf: "list",
  isEmpty: "none",
  isNotEmpty: "none",
};

export function opValueArity(op: FilterOp): OpValueArity {
  return OP_ARITY[op];
}

// ── Field → operator taxonomy ────────────────────────────

/**
 * The handful of *filtering kinds* a consumer's field types collapse into — the
 * axis operators are chosen along. A consumer maps each of its fields to one of
 * these; the operator set + text-DSL semantics follow from the kind alone.
 *
 * `select` is an unordered fixed set (membership only) ; `orderedSelect` is a
 * fixed set with a meaningful order (e.g. a priority enum), so it additionally
 * supports comparisons (`>= HIGH`) which a compiler resolves by expanding the
 * range to the concrete values from the field's declared option order.
 */
export type FilterableKind =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "orderedSelect"
  | "multiSelect"
  | "relation"
  | "attachments";

const OPS_BY_KIND: Record<FilterableKind, readonly FilterOp[]> = {
  text: [
    "is",
    "isNot",
    "contains",
    "notContains",
    "startsWith",
    "endsWith",
    "isEmpty",
    "isNotEmpty",
  ],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "between", "isEmpty", "isNotEmpty"],
  boolean: ["isTrue", "isFalse"],
  date: ["is", "before", "after", "onOrBefore", "onOrAfter", "between", "isEmpty", "isNotEmpty"],
  select: ["isAnyOf", "isNoneOf", "isEmpty", "isNotEmpty"],
  orderedSelect: ["isAnyOf", "isNoneOf", "gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"],
  multiSelect: ["hasAnyOf", "hasAllOf", "hasNoneOf", "isEmpty", "isNotEmpty"],
  relation: ["isAnyOf", "isEmpty", "isNotEmpty"],
  attachments: ["isEmpty", "isNotEmpty"],
};

/** The operators offered for a filtering kind, in menu order (the first is the
 *  sensible default the editor pre-selects). */
export function legalOps(kind: FilterableKind): readonly FilterOp[] {
  return OPS_BY_KIND[kind];
}

// The operator a bare `field:value` (no prefix) means, per kind — the one the
// text printer emits without a prefix and the menu pre-selects.
const DEFAULT_OP_BY_KIND: Record<FilterableKind, FilterOp> = {
  text: "contains",
  number: "eq",
  date: "is",
  boolean: "isTrue", // boolean uses a value form (:true/:false), never the bare op
  select: "isAnyOf",
  orderedSelect: "isAnyOf",
  multiSelect: "hasAnyOf",
  relation: "isAnyOf",
  attachments: "isNotEmpty", // file fields only take :empty / :present
};

export function defaultOpForKind(kind: FilterableKind): FilterOp {
  return DEFAULT_OP_BY_KIND[kind];
}

/** Whether `op` is valid for `kind` — the guard the compiler and input
 *  validator use to reject a nonsensical field/operator pairing. */
export function isOpLegal(kind: FilterableKind, op: FilterOp): boolean {
  return OPS_BY_KIND[kind].includes(op);
}

// ── AST ──────────────────────────────────────────────────

/** A single field predicate. `value` is absent for `none`-arity operators
 *  (`isEmpty`, `isTrue`, …), a string for `scalar`, and a `string[]` for `list`
 *  / `pair` (`between` carries exactly two). Values are always string-encoded on
 *  the wire ; the compiler coerces per the field's kind (numbers, dates). */
export interface FilterLeaf {
  kind: "leaf";
  field: string;
  op: FilterOp;
  value?: string | string[];
}

/** A boolean grouping of child nodes. `negate` wraps the whole group in a NOT,
 *  which is how `-status:open` and De Morgan compositions round-trip. */
export interface FilterGroup {
  kind: "group";
  combinator: "and" | "or";
  negate?: boolean;
  children: FilterNode[];
}

export type FilterNode = FilterLeaf | FilterGroup;

// Backstops against a pathological tree (deep nesting / huge fan-out driving
// CPU + a monster query `where`). Legit queries are far smaller.
export const MAX_FILTER_NODES = 100;
export const MAX_FILTER_DEPTH = 8;

// ── Zod input schema ─────────────────────────────────────

const filterOpSchema = z.enum(FILTER_OPS);

// Recursive : a group holds child nodes. `z.lazy` breaks the cycle ; the
// node-count + depth caps are enforced by the top-level refinement in
// `filterQuerySchema` (per-node recursion here would double-count).
const filterLeafSchema = z.object({
  kind: z.literal("leaf"),
  field: z.string().min(1).max(120),
  op: filterOpSchema,
  value: z.union([z.string().max(1000), z.array(z.string().max(1000)).max(50)]).optional(),
});

const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    kind: z.literal("group"),
    combinator: z.enum(["and", "or"]),
    negate: z.boolean().optional(),
    children: z.array(filterNodeSchema).max(MAX_FILTER_NODES),
  }),
);

const filterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([filterLeafSchema, filterGroupSchema]),
);

function measure(node: FilterNode, depth: number): { count: number; maxDepth: number } {
  if (node.kind === "leaf") return { count: 1, maxDepth: depth };
  let count = 1;
  let maxDepth = depth;
  for (const child of node.children) {
    const m = measure(child, depth + 1);
    count += m.count;
    if (m.maxDepth > maxDepth) maxDepth = m.maxDepth;
  }
  return { count, maxDepth };
}

/**
 * The wire schema for a full query tree, with total-node + nesting-depth caps
 * so an adversarial input can't drive unbounded recursion or an enormous query
 * `where`. Use this as the `filter` field of a list procedure's input.
 */
export const filterQuerySchema = filterNodeSchema.superRefine((node, ctx) => {
  const { count, maxDepth } = measure(node, 1);
  if (count > MAX_FILTER_NODES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Query has too many conditions (max ${MAX_FILTER_NODES}).`,
    });
  }
  if (maxDepth > MAX_FILTER_DEPTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Query is nested too deeply (max ${MAX_FILTER_DEPTH}).`,
    });
  }
});

// ── Small constructors (ergonomics for callers + tests) ──

export function leaf(field: string, op: FilterOp, value?: string | string[]): FilterLeaf {
  return value === undefined ? { kind: "leaf", field, op } : { kind: "leaf", field, op, value };
}

/** The relation keys a tree traverses into (the `rel` of any `rel.subField`
 *  leaf), so the caller can resolve just those target models. */
export function collectTraversalRelationKeys(node: FilterNode): Set<string> {
  const keys = new Set<string>();
  const walk = (n: FilterNode): void => {
    if (n.kind === "leaf") {
      const dot = n.field.indexOf(".");
      if (dot > 0) keys.add(n.field.slice(0, dot));
    } else {
      n.children.forEach(walk);
    }
  };
  walk(node);
  return keys;
}

export function group(
  combinator: "and" | "or",
  children: FilterNode[],
  negate?: boolean,
): FilterGroup {
  return negate
    ? { kind: "group", combinator, children, negate }
    : { kind: "group", combinator, children };
}

// ── Generic tree walk ────────────────────────────────────

/** A fold over a {@link FilterNode} tree into a target representation `T`. Each
 *  consumer supplies how a leaf compiles and how AND / OR / NOT combine, and
 *  gets the whole-tree compile for free — the one place the boolean structure
 *  is interpreted, shared by every module's compiler. `empty` is the value for
 *  a group with no children (a no-op predicate). */
export interface FilterVisitor<T> {
  leaf: (leaf: FilterLeaf) => T;
  and: (parts: T[]) => T;
  or: (parts: T[]) => T;
  not: (inner: T) => T;
  empty: T;
}

export function walkFilter<T>(node: FilterNode, visitor: FilterVisitor<T>): T {
  if (node.kind === "leaf") return visitor.leaf(node);
  const parts = node.children.map((child) => walkFilter(child, visitor));
  const combined =
    parts.length === 0
      ? visitor.empty
      : node.combinator === "and"
        ? visitor.and(parts)
        : visitor.or(parts);
  return node.negate ? visitor.not(combined) : combined;
}
