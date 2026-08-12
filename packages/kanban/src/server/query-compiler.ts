import { Prisma } from "@monark/db";
import { ValidationError } from "@monark/common";
import {
  isQueryVariable,
  resolveQueryVariable,
  walkFilter,
  type FilterLeaf,
  type FilterNode,
  type QueryContext,
} from "@monark/query/contracts";
import type { KanbanCardPriority } from "../contracts/types";
import { KANBAN_PRIORITY_ORDER } from "../contracts/query-fields";

/**
 * Compiles a MonarkQL {@link FilterNode} tree into a structured
 * `Prisma.KanbanCardWhereInput`. Unlike the data-models compiler (raw SQL over a
 * JSONB `data` column), Kanban cards are real columns, so a typed Prisma `where`
 * suffices — no raw SQL, no expression indexes. `@variable` values (`@me`,
 * `@today`, …) are resolved at compile time via {@link resolveQueryVariable}.
 * The caller scopes results to a board ; this only builds the predicate.
 */
export function compileKanbanFilter(
  node: FilterNode,
  ctx: QueryContext,
): Prisma.KanbanCardWhereInput {
  return walkFilter<Prisma.KanbanCardWhereInput>(node, {
    leaf: (leaf) => compileLeaf(leaf, ctx),
    and: (parts) => ({ AND: parts }),
    or: (parts) => ({ OR: parts }),
    not: (inner) => ({ NOT: inner }),
    empty: {},
  });
}

// ── value helpers ────────────────────────────────────────

function resolveOne(value: string, ctx: QueryContext): string {
  if (!isQueryVariable(value)) return value;
  const resolved = resolveQueryVariable(value, ctx);
  if (resolved === null) throw new ValidationError(`Unknown query variable "${value}".`);
  return resolved;
}

function scalar(leaf: FilterLeaf, ctx: QueryContext): string {
  if (typeof leaf.value !== "string") {
    throw new ValidationError(`"${leaf.field}" expects a single value.`);
  }
  return resolveOne(leaf.value, ctx);
}

function list(leaf: FilterLeaf, ctx: QueryContext): string[] {
  const raw = Array.isArray(leaf.value) ? leaf.value : leaf.value != null ? [leaf.value] : [];
  if (raw.length === 0) throw new ValidationError(`"${leaf.field}" expects at least one value.`);
  return raw.map((v) => resolveOne(v, ctx));
}

function pair(leaf: FilterLeaf, ctx: QueryContext): [string, string] {
  if (!Array.isArray(leaf.value) || leaf.value.length !== 2) {
    throw new ValidationError(`"${leaf.field}" expects a range (two values).`);
  }
  return [resolveOne(leaf.value[0]!, ctx), resolveOne(leaf.value[1]!, ctx)];
}

function toNumber(v: string, field: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ValidationError(`"${field}" expects a number, got "${v}".`);
  return n;
}

function toDate(v: string, field: string): Date {
  const d = new Date(v);
  if (Number.isNaN(d.getTime()))
    throw new ValidationError(`"${field}" expects a date, got "${v}".`);
  return d;
}

function dayStart(d: Date): Date {
  const x = new Date(d.getTime());
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function illegal(leaf: FilterLeaf): never {
  throw new ValidationError(`Operator "${leaf.op}" is not valid for "${leaf.field}".`);
}

// ── per-field compilation ────────────────────────────────

function compileLeaf(leaf: FilterLeaf, ctx: QueryContext): Prisma.KanbanCardWhereInput {
  switch (leaf.field) {
    case "title":
      return { title: stringFilter(leaf, ctx) };
    case "description":
      return descriptionWhere(leaf, ctx);
    case "status":
      return statusWhere(leaf, ctx);
    case "assignee":
      return arrayWhere("assigneeIds", leaf, ctx);
    case "reviewer":
      return arrayWhere("reviewerIds", leaf, ctx);
    case "priority":
      return priorityWhere(leaf, ctx);
    case "due":
      return { dueAt: nullableDateFilter(leaf, ctx) };
    case "estimate":
      return { estimate: nullableNumberFilter(leaf, ctx) };
    case "created":
      return { createdAt: dateFilter(leaf, ctx) };
    case "updated":
      return { updatedAt: dateFilter(leaf, ctx) };
    default:
      throw new ValidationError(`Unknown filter field "${leaf.field}".`);
  }
}

function stringFilter(leaf: FilterLeaf, ctx: QueryContext): Prisma.StringFilter {
  const mode = Prisma.QueryMode.insensitive;
  switch (leaf.op) {
    case "is":
      return { equals: scalar(leaf, ctx), mode };
    case "isNot":
      // `mode` lives at the top of the StringFilter and applies to `not` too.
      return { not: scalar(leaf, ctx), mode };
    case "contains":
      return { contains: scalar(leaf, ctx), mode };
    case "notContains":
      return { not: { contains: scalar(leaf, ctx) }, mode };
    case "startsWith":
      return { startsWith: scalar(leaf, ctx), mode };
    case "endsWith":
      return { endsWith: scalar(leaf, ctx), mode };
    case "isEmpty":
      return { equals: "" };
    case "isNotEmpty":
      return { not: { equals: "" } };
    default:
      return illegal(leaf);
  }
}

// The description is now a JSON block array ; filter its plain-text projection
// `descriptionText` (a non-nullable column, so "empty" is just an empty string).
function descriptionWhere(leaf: FilterLeaf, ctx: QueryContext): Prisma.KanbanCardWhereInput {
  if (leaf.op === "isEmpty") return { descriptionText: "" };
  if (leaf.op === "isNotEmpty") return { descriptionText: { not: "" } };
  return { descriptionText: stringFilter(leaf, ctx) };
}

// `status` is the board's column ; a select over `columnId` (options = columns).
function statusWhere(leaf: FilterLeaf, ctx: QueryContext): Prisma.KanbanCardWhereInput {
  switch (leaf.op) {
    case "isAnyOf":
      return { columnId: { in: list(leaf, ctx) } };
    case "isNoneOf":
      return { columnId: { notIn: list(leaf, ctx) } };
    case "isEmpty":
      return { columnId: { in: [] } }; // columnId is required → matches nothing
    case "isNotEmpty":
      return {}; // always present
    default:
      return illegal(leaf);
  }
}

// `assignee` / `reviewer` are `String[]` scalar lists (org-member ids).
function arrayWhere(
  column: "assigneeIds" | "reviewerIds",
  leaf: FilterLeaf,
  ctx: QueryContext,
): Prisma.KanbanCardWhereInput {
  switch (leaf.op) {
    case "hasAnyOf":
      return { [column]: { hasSome: list(leaf, ctx) } };
    case "hasAllOf":
      return { [column]: { hasEvery: list(leaf, ctx) } };
    case "hasNoneOf":
      return { NOT: { [column]: { hasSome: list(leaf, ctx) } } };
    case "isEmpty":
      return { [column]: { isEmpty: true } };
    case "isNotEmpty":
      return { [column]: { isEmpty: false } };
    default:
      return illegal(leaf);
  }
}

function isPriority(v: string): v is KanbanCardPriority {
  return (KANBAN_PRIORITY_ORDER as readonly string[]).includes(v);
}

// `priority` is an ordered enum : membership (isAnyOf/isNoneOf) plus comparisons
// (`>=HIGH`) resolved by expanding the range to the concrete value set.
function priorityWhere(leaf: FilterLeaf, ctx: QueryContext): Prisma.KanbanCardWhereInput {
  const order = KANBAN_PRIORITY_ORDER;
  switch (leaf.op) {
    case "isAnyOf":
      return { priority: { in: list(leaf, ctx).filter(isPriority) } };
    case "isNoneOf":
      return { priority: { notIn: list(leaf, ctx).filter(isPriority) } };
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const v = scalar(leaf, ctx);
      const idx = isPriority(v) ? order.indexOf(v) : -1;
      const set: KanbanCardPriority[] =
        idx < 0
          ? []
          : leaf.op === "gt"
            ? [...order.slice(idx + 1)]
            : leaf.op === "gte"
              ? [...order.slice(idx)]
              : leaf.op === "lt"
                ? [...order.slice(0, idx)]
                : [...order.slice(0, idx + 1)];
      return { priority: { in: set } };
    }
    case "isEmpty":
      return { priority: null };
    case "isNotEmpty":
      return { priority: { not: null } };
    default:
      return illegal(leaf);
  }
}

// Shared date semantics ; `dueAt` is nullable so it also supports presence.
function nullableDateFilter(leaf: FilterLeaf, ctx: QueryContext): Prisma.DateTimeNullableFilter {
  if (leaf.op === "isEmpty") return { equals: null };
  if (leaf.op === "isNotEmpty") return { not: null };
  return dateFilter(leaf, ctx);
}

function dateFilter(leaf: FilterLeaf, ctx: QueryContext): Prisma.DateTimeFilter {
  switch (leaf.op) {
    case "is": {
      const start = dayStart(toDate(scalar(leaf, ctx), leaf.field));
      const next = new Date(start.getTime() + 86_400_000);
      return { gte: start, lt: next };
    }
    case "before":
      return { lt: toDate(scalar(leaf, ctx), leaf.field) };
    case "after":
      return { gt: toDate(scalar(leaf, ctx), leaf.field) };
    case "onOrBefore":
      return { lte: toDate(scalar(leaf, ctx), leaf.field) };
    case "onOrAfter":
      return { gte: toDate(scalar(leaf, ctx), leaf.field) };
    case "between": {
      const [a, b] = pair(leaf, ctx);
      return { gte: toDate(a, leaf.field), lte: toDate(b, leaf.field) };
    }
    default:
      return illegal(leaf);
  }
}

function nullableNumberFilter(leaf: FilterLeaf, ctx: QueryContext): Prisma.IntNullableFilter {
  switch (leaf.op) {
    case "eq":
      return { equals: toNumber(scalar(leaf, ctx), leaf.field) };
    case "neq":
      return { not: toNumber(scalar(leaf, ctx), leaf.field) };
    case "gt":
      return { gt: toNumber(scalar(leaf, ctx), leaf.field) };
    case "gte":
      return { gte: toNumber(scalar(leaf, ctx), leaf.field) };
    case "lt":
      return { lt: toNumber(scalar(leaf, ctx), leaf.field) };
    case "lte":
      return { lte: toNumber(scalar(leaf, ctx), leaf.field) };
    case "between": {
      const [a, b] = pair(leaf, ctx);
      return { gte: toNumber(a, leaf.field), lte: toNumber(b, leaf.field) };
    }
    case "isEmpty":
      return { equals: null };
    case "isNotEmpty":
      return { not: null };
    default:
      return illegal(leaf);
  }
}
