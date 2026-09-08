import { describe, expect, it } from "vitest";

import { fieldFiltersToFilterNode, type RecordFieldFilter } from "../src/contracts/query";

/**
 * The legacy filter-menu shape no longer has its own execution path ; it is
 * translated into a MonarkQL tree and run through the one compiler. These tests
 * pin that translation, since a drift here silently changes what the classic
 * filter menu returns.
 */
describe("fieldFiltersToFilterNode", () => {
  it("returns undefined for nothing to filter on", () => {
    expect(fieldFiltersToFilterNode(undefined)).toBeUndefined();
    expect(fieldFiltersToFilterNode([])).toBeUndefined();
  });

  it("collapses a single predicate to a bare leaf (no redundant group)", () => {
    expect(fieldFiltersToFilterNode([{ key: "title", type: "text", value: "bug" }])).toEqual({
      kind: "leaf",
      field: "title",
      op: "contains",
      value: "bug",
    });
  });

  it("ANDs several predicates together", () => {
    const node = fieldFiltersToFilterNode([
      { key: "title", type: "text", value: "bug" },
      { key: "priority", type: "number", value: "1" },
    ]);
    expect(node).toEqual({
      kind: "group",
      combinator: "and",
      children: [
        { kind: "leaf", field: "title", op: "contains", value: "bug" },
        { kind: "leaf", field: "priority", op: "eq", value: "1" },
      ],
    });
  });

  it.each<[string, RecordFieldFilter, unknown]>([
    [
      "text becomes a contains leaf",
      { key: "title", type: "text", value: "bug" },
      { kind: "leaf", field: "title", op: "contains", value: "bug" },
    ],
    [
      "date becomes a same-day is leaf",
      { key: "due", type: "date", value: "2026-09-08" },
      { kind: "leaf", field: "due", op: "is", value: "2026-09-08" },
    ],
    [
      "number becomes eq",
      { key: "priority", type: "number", value: "3" },
      { kind: "leaf", field: "priority", op: "eq", value: "3" },
    ],
    [
      "boolean true becomes isTrue with no value",
      { key: "done", type: "boolean", value: "true" },
      { kind: "leaf", field: "done", op: "isTrue" },
    ],
    [
      "boolean false becomes isFalse with no value",
      { key: "done", type: "boolean", value: "false" },
      { kind: "leaf", field: "done", op: "isFalse" },
    ],
    [
      "single select becomes a one-element isAnyOf",
      { key: "status", type: "select", value: "closed" },
      { kind: "leaf", field: "status", op: "isAnyOf", value: ["closed"] },
    ],
    [
      "selectAny becomes isAnyOf",
      { key: "status", type: "selectAny", value: ["open", "closed"] },
      { kind: "leaf", field: "status", op: "isAnyOf", value: ["open", "closed"] },
    ],
    [
      "multiSelect becomes hasAnyOf",
      { key: "tags", type: "multiSelect", value: ["perf", "ux"] },
      { kind: "leaf", field: "tags", op: "hasAnyOf", value: ["perf", "ux"] },
    ],
  ])("%s", (_label, filter, expected) => {
    expect(fieldFiltersToFilterNode([filter])).toEqual(expected);
  });

  describe("neutral values compose out, exactly as the old null where-fragment did", () => {
    it.each<[string, RecordFieldFilter]>([
      ["empty text", { key: "title", type: "text", value: "" }],
      ["whitespace-only text", { key: "title", type: "text", value: "   " }],
      ["empty date", { key: "due", type: "date", value: "" }],
      ["empty number", { key: "priority", type: "number", value: "" }],
      ["non-numeric number", { key: "priority", type: "number", value: "abc" }],
      ["non-boolean boolean", { key: "done", type: "boolean", value: "maybe" }],
      ["empty select", { key: "status", type: "select", value: "" }],
      ["empty selectAny", { key: "status", type: "selectAny", value: [] }],
      ["selectAny of empty strings", { key: "status", type: "selectAny", value: ["", ""] }],
      ["empty multiSelect", { key: "tags", type: "multiSelect", value: [] }],
    ])("drops %s", (_label, filter) => {
      expect(fieldFiltersToFilterNode([filter])).toBeUndefined();
    });

    it("drops only the neutral one when mixed with a real predicate", () => {
      expect(
        fieldFiltersToFilterNode([
          { key: "title", type: "text", value: "" },
          { key: "status", type: "select", value: "open" },
        ]),
      ).toEqual({ kind: "leaf", field: "status", op: "isAnyOf", value: ["open"] });
    });
  });

  it("keeps a numeric zero, which is falsy but a real filter value", () => {
    expect(fieldFiltersToFilterNode([{ key: "priority", type: "number", value: "0" }])).toEqual({
      kind: "leaf",
      field: "priority",
      op: "eq",
      value: "0",
    });
  });
});
