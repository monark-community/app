import { describe, expect, it } from "vitest";
import { group, leaf, type FilterNode } from "../src/contracts/query";
import { fieldKindsFrom, parseQuery, printQuery } from "../src/contracts/query-dsl";

const kinds = fieldKindsFrom([
  { key: "title", kind: "text" },
  { key: "priority", kind: "number" },
  { key: "due", kind: "date" },
  { key: "status", kind: "select" },
  { key: "tags", kind: "multiSelect" },
  { key: "done", kind: "boolean" },
  { key: "assignee", kind: "relation" },
  // A traversal "virtual" field, surfaced so dotted paths parse + print.
  { key: "assignee.title", kind: "text" },
]);

describe("parseQuery — predicate forms", () => {
  it("shorthand resolves the default op per kind", () => {
    expect(parseQuery("title:hello", kinds)).toEqual(leaf("title", "contains", "hello"));
    expect(parseQuery("status:open", kinds)).toEqual(leaf("status", "isAnyOf", ["open"]));
    expect(parseQuery("priority:5", kinds)).toEqual(leaf("priority", "eq", "5"));
  });

  it("comparison + text + all-of prefixes", () => {
    expect(parseQuery("priority:>=3", kinds)).toEqual(leaf("priority", "gte", "3"));
    expect(parseQuery("due:<2026-01-01", kinds)).toEqual(leaf("due", "before", "2026-01-01"));
    expect(parseQuery("title:=Exact", kinds)).toEqual(leaf("title", "is", "Exact"));
    expect(parseQuery("tags:&red,blue", kinds)).toEqual(leaf("tags", "hasAllOf", ["red", "blue"]));
  });

  it("range, presence, boolean, negation, traversal", () => {
    expect(parseQuery("priority:2..5", kinds)).toEqual(leaf("priority", "between", ["2", "5"]));
    expect(parseQuery("title:present", kinds)).toEqual(leaf("title", "isNotEmpty"));
    expect(parseQuery("done:true", kinds)).toEqual(leaf("done", "isTrue"));
    expect(parseQuery("-status:open", kinds)).toEqual(leaf("status", "isNoneOf", ["open"]));
    expect(parseQuery("assignee.title:alice", kinds)).toEqual(
      leaf("assignee.title", "contains", "alice"),
    );
  });

  it("booleans + parens + precedence", () => {
    expect(parseQuery("status:open priority:>3", kinds)).toEqual(
      group("and", [leaf("status", "isAnyOf", ["open"]), leaf("priority", "gt", "3")]),
    );
    expect(parseQuery("(status:open OR status:closed) done:true", kinds)).toEqual(
      group("and", [
        group("or", [leaf("status", "isAnyOf", ["open"]), leaf("status", "isAnyOf", ["closed"])]),
        leaf("done", "isTrue"),
      ]),
    );
  });

  it("rejects unknown field / illegal op / bare word / unbalanced parens", () => {
    expect(() => parseQuery("nope:1", kinds)).toThrow();
    expect(() => parseQuery("status:>3", kinds)).toThrow();
    expect(() => parseQuery("hello", kinds)).toThrow();
    expect(() => parseQuery("(status:open", kinds)).toThrow();
  });
});

describe("round-trip parse(print(tree)) === tree", () => {
  const trees: FilterNode[] = [
    leaf("title", "contains", "hello world"),
    leaf("title", "is", "Exact"),
    leaf("priority", "between", ["2", "5"]),
    leaf("status", "isAnyOf", ["open", "closed"]),
    leaf("status", "isNoneOf", ["open"]),
    leaf("tags", "hasAllOf", ["red", "blue"]),
    leaf("title", "isEmpty"),
    leaf("assignee", "isAnyOf", ["@me"]),
    leaf("due", "before", "@today"),
    leaf("assignee.title", "contains", "alice"),
    group("or", [leaf("done", "isTrue"), leaf("priority", "lt", "2")]),
    group("and", [
      group("or", [leaf("status", "isAnyOf", ["open"]), leaf("status", "isAnyOf", ["closed"])]),
      leaf("done", "isTrue"),
    ]),
    group("and", [leaf("title", "contains", "x")], true),
  ];

  it.each(trees.map((t) => [JSON.stringify(t), t] as const))("round-trips %s", (_l, tree) => {
    expect(parseQuery(printQuery(tree, kinds), kinds)).toEqual(tree);
  });
});
