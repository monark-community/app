import { describe, expect, it } from "vitest";
import {
  collectTraversalRelationKeys,
  defaultOpForKind,
  filterQuerySchema,
  group,
  isOpLegal,
  leaf,
  legalOps,
  MAX_FILTER_DEPTH,
  opValueArity,
  walkFilter,
  type FilterNode,
} from "../src/contracts/query";

describe("operator taxonomy", () => {
  it("legalOps offers a type-appropriate set with a default first", () => {
    expect(legalOps("number")).toContain("between");
    expect(defaultOpForKind("number")).toBe("eq");
    expect(defaultOpForKind("text")).toBe("contains");
    expect(legalOps("orderedSelect")).toEqual(expect.arrayContaining(["gt", "lte", "isAnyOf"]));
  });

  it("isOpLegal rejects nonsensical pairings", () => {
    expect(isOpLegal("number", "gt")).toBe(true);
    expect(isOpLegal("text", "gt")).toBe(false);
    expect(isOpLegal("orderedSelect", "gte")).toBe(true);
    expect(isOpLegal("select", "gte")).toBe(false);
  });

  it("opValueArity classifies value shape", () => {
    expect(opValueArity("isEmpty")).toBe("none");
    expect(opValueArity("between")).toBe("pair");
    expect(opValueArity("isAnyOf")).toBe("list");
    expect(opValueArity("gt")).toBe("scalar");
  });
});

describe("filterQuerySchema", () => {
  it("accepts a well-formed tree", () => {
    const tree = group("and", [
      leaf("status", "isAnyOf", ["open"]),
      group("or", [leaf("priority", "gt", "3"), leaf("title", "contains", "x")], true),
    ]);
    expect(filterQuerySchema.safeParse(tree).success).toBe(true);
  });

  it("rejects over-deep nesting", () => {
    let node: FilterNode = leaf("title", "isNotEmpty");
    for (let i = 0; i <= MAX_FILTER_DEPTH; i += 1) node = group("and", [node]);
    expect(filterQuerySchema.safeParse(node).success).toBe(false);
  });
});

describe("collectTraversalRelationKeys", () => {
  it("gathers the relation of each dotted leaf", () => {
    const tree = group("and", [
      leaf("assignee.title", "contains", "a"),
      leaf("status", "isAnyOf", ["open"]),
      leaf("project.name", "is", "x"),
    ]);
    expect([...collectTraversalRelationKeys(tree)].sort()).toEqual(["assignee", "project"]);
  });
});

describe("walkFilter", () => {
  it("folds a tree via the visitor, honoring AND/OR/NOT/empty", () => {
    const tree = group("and", [
      leaf("a", "isNotEmpty"),
      group("or", [leaf("b", "isNotEmpty"), leaf("c", "isNotEmpty")], true),
    ]);
    const sql = walkFilter<string>(tree, {
      leaf: (l) => l.field,
      and: (p) => `(${p.join(" AND ")})`,
      or: (p) => `(${p.join(" OR ")})`,
      not: (i) => `NOT ${i}`,
      empty: "TRUE",
    });
    expect(sql).toBe("(a AND NOT (b OR c))");
    expect(
      walkFilter<string>(group("and", []), {
        leaf: () => "x",
        and: () => "?",
        or: () => "?",
        not: (i) => i,
        empty: "TRUE",
      }),
    ).toBe("TRUE");
  });
});
