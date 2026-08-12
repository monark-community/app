import { describe, expect, it } from "vitest";
import { ValidationError } from "@monark/common";
import type { FilterLeaf, FilterNode, FilterOp, QueryContext } from "@monark/query/contracts";
import { compileKanbanFilter } from "../src/server/query-compiler";

// Unit coverage for the pure Kanban MonarkQL → Prisma-`where` compiler. The
// end-to-end suite (kanban-query.test.ts) proves the rows come back right ;
// this drives every field × operator × error branch directly, no DB, so the
// operator tables and the value-coercion / illegal-operator guards are all
// exercised. `@me` resolves against ctx.userId, dates against ctx.now.

const CTX: QueryContext = { userId: "u-me", now: new Date("2026-08-10T12:00:00.000Z") };
const INSENS = "insensitive";

const leaf = (field: string, op: string, value?: string | string[]): FilterLeaf => ({
  kind: "leaf",
  field,
  op: op as FilterOp,
  value,
});
const compile = (node: FilterNode) => compileKanbanFilter(node, CTX);
const group = (combinator: "and" | "or", children: FilterNode[], negate = false): FilterNode => ({
  kind: "group",
  combinator,
  negate,
  children,
});

describe("title / string operators", () => {
  it("compiles every string operator", () => {
    expect(compile(leaf("title", "is", "x"))).toEqual({ title: { equals: "x", mode: INSENS } });
    expect(compile(leaf("title", "isNot", "x"))).toEqual({ title: { not: "x", mode: INSENS } });
    expect(compile(leaf("title", "contains", "x"))).toEqual({
      title: { contains: "x", mode: INSENS },
    });
    expect(compile(leaf("title", "notContains", "x"))).toEqual({
      title: { not: { contains: "x" }, mode: INSENS },
    });
    expect(compile(leaf("title", "startsWith", "x"))).toEqual({
      title: { startsWith: "x", mode: INSENS },
    });
    expect(compile(leaf("title", "endsWith", "x"))).toEqual({
      title: { endsWith: "x", mode: INSENS },
    });
    expect(compile(leaf("title", "isEmpty"))).toEqual({ title: { equals: "" } });
    expect(compile(leaf("title", "isNotEmpty"))).toEqual({ title: { not: { equals: "" } } });
  });

  it("rejects an operator the field doesn't support", () => {
    expect(() => compile(leaf("title", "gt", "x"))).toThrow(ValidationError);
  });
});

describe("description (block body, filtered via its text projection)", () => {
  it("filters the `descriptionText` column ; empty is a blank string", () => {
    expect(compile(leaf("description", "isEmpty"))).toEqual({ descriptionText: "" });
    expect(compile(leaf("description", "isNotEmpty"))).toEqual({ descriptionText: { not: "" } });
    expect(compile(leaf("description", "contains", "x"))).toEqual({
      descriptionText: { contains: "x", mode: INSENS },
    });
  });
});

describe("status (columnId select)", () => {
  it("maps membership + presence to columnId", () => {
    expect(compile(leaf("status", "isAnyOf", ["a", "b"]))).toEqual({
      columnId: { in: ["a", "b"] },
    });
    expect(compile(leaf("status", "isNoneOf", ["a"]))).toEqual({ columnId: { notIn: ["a"] } });
    expect(compile(leaf("status", "isEmpty"))).toEqual({ columnId: { in: [] } });
    expect(compile(leaf("status", "isNotEmpty"))).toEqual({});
  });

  it("rejects an unsupported operator", () => {
    expect(() => compile(leaf("status", "is", "a"))).toThrow(ValidationError);
  });
});

describe("assignee / reviewer (scalar-list columns)", () => {
  it("compiles the array operators for both columns", () => {
    expect(compile(leaf("assignee", "hasAnyOf", ["a", "b"]))).toEqual({
      assigneeIds: { hasSome: ["a", "b"] },
    });
    expect(compile(leaf("assignee", "hasAllOf", ["a", "b"]))).toEqual({
      assigneeIds: { hasEvery: ["a", "b"] },
    });
    expect(compile(leaf("assignee", "hasNoneOf", ["a"]))).toEqual({
      NOT: { assigneeIds: { hasSome: ["a"] } },
    });
    expect(compile(leaf("assignee", "isEmpty"))).toEqual({ assigneeIds: { isEmpty: true } });
    expect(compile(leaf("assignee", "isNotEmpty"))).toEqual({ assigneeIds: { isEmpty: false } });
    // reviewer takes the same path against its own column.
    expect(compile(leaf("reviewer", "hasAnyOf", ["r"]))).toEqual({
      reviewerIds: { hasSome: ["r"] },
    });
  });

  it("rejects an unsupported operator", () => {
    expect(() => compile(leaf("assignee", "is", "a"))).toThrow(ValidationError);
  });
});

describe("priority (ordered enum)", () => {
  it("membership drops non-priority values", () => {
    expect(compile(leaf("priority", "isAnyOf", ["HIGH", "bogus", "LOW"]))).toEqual({
      priority: { in: ["HIGH", "LOW"] },
    });
    expect(compile(leaf("priority", "isNoneOf", ["LOW"]))).toEqual({
      priority: { notIn: ["LOW"] },
    });
  });

  it("expands comparisons into the concrete value set", () => {
    expect(compile(leaf("priority", "gt", "MEDIUM"))).toEqual({
      priority: { in: ["HIGH", "CRITICAL"] },
    });
    expect(compile(leaf("priority", "gte", "MEDIUM"))).toEqual({
      priority: { in: ["MEDIUM", "HIGH", "CRITICAL"] },
    });
    expect(compile(leaf("priority", "lt", "HIGH"))).toEqual({
      priority: { in: ["LOW", "MEDIUM"] },
    });
    expect(compile(leaf("priority", "lte", "HIGH"))).toEqual({
      priority: { in: ["LOW", "MEDIUM", "HIGH"] },
    });
    // An unknown value yields an empty (matches-nothing) set.
    expect(compile(leaf("priority", "gt", "bogus"))).toEqual({ priority: { in: [] } });
  });

  it("handles presence and rejects an unsupported operator", () => {
    expect(compile(leaf("priority", "isEmpty"))).toEqual({ priority: null });
    expect(compile(leaf("priority", "isNotEmpty"))).toEqual({ priority: { not: null } });
    expect(() => compile(leaf("priority", "contains", "x"))).toThrow(ValidationError);
  });
});

describe("date fields (created / updated / due)", () => {
  it("compiles the full date operator set", () => {
    const day = compile(leaf("created", "is", "2026-01-15")) as {
      createdAt: { gte: Date; lt: Date };
    };
    expect(day.createdAt.gte.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(day.createdAt.lt.toISOString()).toBe("2026-01-16T00:00:00.000Z");

    expect(compile(leaf("created", "before", "2026-01-15"))).toMatchObject({
      createdAt: { lt: expect.any(Date) },
    });
    expect(compile(leaf("created", "after", "2026-01-15"))).toMatchObject({
      createdAt: { gt: expect.any(Date) },
    });
    expect(compile(leaf("created", "onOrBefore", "2026-01-15"))).toMatchObject({
      createdAt: { lte: expect.any(Date) },
    });
    expect(compile(leaf("created", "onOrAfter", "2026-01-15"))).toMatchObject({
      createdAt: { gte: expect.any(Date) },
    });
    expect(compile(leaf("created", "between", ["2026-01-01", "2026-02-01"]))).toMatchObject({
      createdAt: { gte: expect.any(Date), lte: expect.any(Date) },
    });
    // `updated` takes the same date path against its own column.
    expect(compile(leaf("updated", "after", "2026-01-15"))).toMatchObject({
      updatedAt: { gt: expect.any(Date) },
    });
  });

  it("due is nullable : supports presence, then delegates to the date path", () => {
    expect(compile(leaf("due", "isEmpty"))).toEqual({ dueAt: { equals: null } });
    expect(compile(leaf("due", "isNotEmpty"))).toEqual({ dueAt: { not: null } });
    expect(compile(leaf("due", "before", "2026-01-15"))).toMatchObject({
      dueAt: { lt: expect.any(Date) },
    });
  });

  it("rejects an unsupported operator and an invalid date", () => {
    expect(() => compile(leaf("created", "eq", "2026-01-15"))).toThrow(ValidationError);
    expect(() => compile(leaf("created", "before", "not-a-date"))).toThrow(ValidationError);
  });
});

describe("estimate (nullable number)", () => {
  it("compiles the numeric operators and presence", () => {
    expect(compile(leaf("estimate", "eq", "5"))).toEqual({ estimate: { equals: 5 } });
    expect(compile(leaf("estimate", "neq", "5"))).toEqual({ estimate: { not: 5 } });
    expect(compile(leaf("estimate", "gt", "5"))).toEqual({ estimate: { gt: 5 } });
    expect(compile(leaf("estimate", "gte", "5"))).toEqual({ estimate: { gte: 5 } });
    expect(compile(leaf("estimate", "lt", "5"))).toEqual({ estimate: { lt: 5 } });
    expect(compile(leaf("estimate", "lte", "5"))).toEqual({ estimate: { lte: 5 } });
    expect(compile(leaf("estimate", "between", ["2", "8"]))).toEqual({
      estimate: { gte: 2, lte: 8 },
    });
    expect(compile(leaf("estimate", "isEmpty"))).toEqual({ estimate: { equals: null } });
    expect(compile(leaf("estimate", "isNotEmpty"))).toEqual({ estimate: { not: null } });
  });

  it("rejects an unsupported operator and a non-numeric value", () => {
    expect(() => compile(leaf("estimate", "contains", "5"))).toThrow(ValidationError);
    expect(() => compile(leaf("estimate", "eq", "abc"))).toThrow(ValidationError);
  });
});

describe("value coercion + variable resolution", () => {
  it("resolves @me and rejects an unknown variable", () => {
    expect(compile(leaf("assignee", "hasAnyOf", ["@me"]))).toEqual({
      assigneeIds: { hasSome: ["u-me"] },
    });
    expect(() => compile(leaf("assignee", "hasAnyOf", ["@nope"]))).toThrow(ValidationError);
  });

  it("wraps a lone list value and rejects an empty list", () => {
    expect(compile(leaf("status", "isAnyOf", "solo"))).toEqual({ columnId: { in: ["solo"] } });
    expect(() => compile(leaf("status", "isAnyOf", []))).toThrow(ValidationError);
    expect(() => compile(leaf("status", "isAnyOf"))).toThrow(ValidationError);
  });

  it("rejects a multi-value where a scalar is expected", () => {
    expect(() => compile(leaf("title", "is", ["a", "b"]))).toThrow(ValidationError);
  });

  it("rejects a range that isn't exactly two values", () => {
    expect(() => compile(leaf("estimate", "between", ["1"]))).toThrow(ValidationError);
    expect(() => compile(leaf("estimate", "between", "1"))).toThrow(ValidationError);
  });

  it("rejects an unknown field", () => {
    expect(() => compile(leaf("bogus", "is", "x"))).toThrow(ValidationError);
  });
});

describe("boolean composition (walkFilter)", () => {
  it("compiles and / or / not and an empty group", () => {
    const a = leaf("title", "is", "a");
    const b = leaf("priority", "isEmpty");
    expect(compile(group("and", [a, b]))).toEqual({
      AND: [{ title: { equals: "a", mode: INSENS } }, { priority: null }],
    });
    expect(compile(group("or", [a, b]))).toEqual({
      OR: [{ title: { equals: "a", mode: INSENS } }, { priority: null }],
    });
    expect(compile(group("and", [a], true))).toEqual({
      NOT: { AND: [{ title: { equals: "a", mode: INSENS } }] },
    });
    expect(compile(group("and", []))).toEqual({});
  });
});
