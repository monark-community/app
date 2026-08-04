import { describe, expect, it } from "vitest";
import {
  fieldKindsFromDataFields,
  group,
  leaf,
  parseQuery,
  printQuery,
  type FilterNode,
} from "../src/contracts/query";

const kinds = fieldKindsFromDataFields([
  { key: "title", type: "TEXT" },
  { key: "priority", type: "NUMBER" },
  { key: "due", type: "DATE" },
  { key: "status", type: "SELECT" },
  { key: "tags", type: "MULTI_SELECT" },
  { key: "done", type: "BOOLEAN" },
  { key: "assignee", type: "RELATION" },
  { key: "files", type: "ATTACHMENTS" },
  // A traversal "virtual" field (relation.subField) — the server surfaces these
  // so the bar can parse + print dotted paths.
  { key: "assignee.title", type: "TEXT" },
]);

describe("parseQuery — predicate forms", () => {
  it("shorthand resolves the default op per field kind", () => {
    expect(parseQuery("title:hello", kinds)).toEqual(leaf("title", "contains", "hello"));
    expect(parseQuery("status:open", kinds)).toEqual(leaf("status", "isAnyOf", ["open"]));
    expect(parseQuery("tags:red,blue", kinds)).toEqual(leaf("tags", "hasAnyOf", ["red", "blue"]));
    expect(parseQuery("priority:5", kinds)).toEqual(leaf("priority", "eq", "5"));
  });

  it("comparison + text prefixes", () => {
    expect(parseQuery("priority:>3", kinds)).toEqual(leaf("priority", "gt", "3"));
    expect(parseQuery("priority:>=3", kinds)).toEqual(leaf("priority", "gte", "3"));
    expect(parseQuery("due:<2026-01-01", kinds)).toEqual(leaf("due", "before", "2026-01-01"));
    expect(parseQuery("title:=Exact", kinds)).toEqual(leaf("title", "is", "Exact"));
    expect(parseQuery("title:^pre", kinds)).toEqual(leaf("title", "startsWith", "pre"));
    expect(parseQuery("tags:&red,blue", kinds)).toEqual(leaf("tags", "hasAllOf", ["red", "blue"]));
  });

  it("range, presence, boolean, negation", () => {
    expect(parseQuery("priority:2..5", kinds)).toEqual(leaf("priority", "between", ["2", "5"]));
    expect(parseQuery("title:present", kinds)).toEqual(leaf("title", "isNotEmpty"));
    expect(parseQuery("priority:empty", kinds)).toEqual(leaf("priority", "isEmpty"));
    expect(parseQuery("done:true", kinds)).toEqual(leaf("done", "isTrue"));
    expect(parseQuery("-status:open", kinds)).toEqual(leaf("status", "isNoneOf", ["open"]));
  });

  it("traverses a relation via a dotted field", () => {
    expect(parseQuery("assignee.title:alice", kinds)).toEqual(
      leaf("assignee.title", "contains", "alice"),
    );
  });

  it("quoted values keep spaces + commas", () => {
    expect(parseQuery('title:"hello world"', kinds)).toEqual(
      leaf("title", "contains", "hello world"),
    );
    expect(parseQuery('title:="a,b"', kinds)).toEqual(leaf("title", "is", "a,b"));
  });
});

describe("parseQuery — boolean structure", () => {
  it("implicit AND by juxtaposition", () => {
    expect(parseQuery("status:open priority:>3", kinds)).toEqual(
      group("and", [leaf("status", "isAnyOf", ["open"]), leaf("priority", "gt", "3")]),
    );
  });
  it("OR keyword", () => {
    expect(parseQuery("done:true OR priority:<2", kinds)).toEqual(
      group("or", [leaf("done", "isTrue"), leaf("priority", "lt", "2")]),
    );
  });
  it("parentheses group with precedence", () => {
    expect(parseQuery("(status:open OR status:closed) done:true", kinds)).toEqual(
      group("and", [
        group("or", [leaf("status", "isAnyOf", ["open"]), leaf("status", "isAnyOf", ["closed"])]),
        leaf("done", "isTrue"),
      ]),
    );
  });
  it("negated group", () => {
    expect(parseQuery("-(title:x done:true)", kinds)).toEqual(
      group("and", [leaf("title", "contains", "x"), leaf("done", "isTrue")], true),
    );
  });
});

describe("parseQuery — errors", () => {
  it("rejects an unknown field", () => {
    expect(() => parseQuery("nope:1", kinds)).toThrow();
  });
  it("rejects an operator illegal for the field kind", () => {
    expect(() => parseQuery("status:>3", kinds)).toThrow();
  });
  it("rejects a bare word (no field:value)", () => {
    expect(() => parseQuery("hello", kinds)).toThrow();
  });
  it("rejects unbalanced parentheses", () => {
    expect(() => parseQuery("(status:open", kinds)).toThrow();
  });
});

describe("printQuery", () => {
  it("emits canonical text", () => {
    expect(printQuery(leaf("status", "isAnyOf", ["open"]), kinds)).toBe("status:open");
    expect(printQuery(leaf("priority", "gt", "3"), kinds)).toBe("priority:>3");
    expect(printQuery(leaf("title", "is", "Exact"), kinds)).toBe("title:=Exact");
    expect(printQuery(leaf("status", "isNoneOf", ["open"]), kinds)).toBe("-status:open");
    expect(printQuery(leaf("priority", "between", ["2", "5"]), kinds)).toBe("priority:2..5");
    expect(printQuery(leaf("title", "contains", "hello world"), kinds)).toBe('title:"hello world"');
  });
});

describe("round-trip parse(print(tree)) === tree", () => {
  const trees: FilterNode[] = [
    leaf("title", "contains", "hello"),
    leaf("title", "contains", "hello world"),
    leaf("title", "is", "Exact"),
    leaf("priority", "gt", "3"),
    leaf("priority", "between", ["2", "5"]),
    leaf("due", "before", "2026-01-01"),
    leaf("status", "isAnyOf", ["open", "closed"]),
    leaf("status", "isNoneOf", ["open"]),
    leaf("tags", "hasAllOf", ["red", "blue"]),
    leaf("title", "isEmpty"),
    leaf("done", "isTrue"),
    leaf("assignee", "isAnyOf", ["@me"]),
    leaf("due", "before", "@today"),
    leaf("assignee.title", "contains", "alice"),
    group("and", [leaf("status", "isAnyOf", ["open"]), leaf("priority", "gt", "3")]),
    group("or", [leaf("done", "isTrue"), leaf("priority", "lt", "2")]),
    group("and", [
      group("or", [leaf("status", "isAnyOf", ["open"]), leaf("status", "isAnyOf", ["closed"])]),
      leaf("done", "isTrue"),
    ]),
    group("and", [leaf("title", "contains", "x")], true),
  ];

  it.each(trees.map((t) => [JSON.stringify(t), t] as const))("round-trips %s", (_label, tree) => {
    expect(parseQuery(printQuery(tree, kinds), kinds)).toEqual(tree);
  });
});
