import { describe, expect, it } from "vitest";
import { filterableKindOf } from "../src/contracts/query";

// The generic operator taxonomy / DSL / @variables / schema now live in
// `@monark/query` and are tested there (packages/query/tests). What's
// data-models-specific — and only tested here — is the `DataFieldType →
// FilterableKind` bridge, including resolving a FORMULA field through its
// inferred result type.

describe("filterableKindOf (DataFieldType → FilterableKind bridge)", () => {
  it("maps concrete field types to a filtering kind", () => {
    expect(filterableKindOf("TEXT")).toBe("text");
    expect(filterableKindOf("LONG_TEXT")).toBe("text");
    expect(filterableKindOf("URL")).toBe("text");
    expect(filterableKindOf("EMAIL")).toBe("text");
    expect(filterableKindOf("NUMBER")).toBe("number");
    expect(filterableKindOf("BOOLEAN")).toBe("boolean");
    expect(filterableKindOf("DATE")).toBe("date");
    expect(filterableKindOf("DATETIME")).toBe("date");
    expect(filterableKindOf("SELECT")).toBe("select");
    expect(filterableKindOf("MULTI_SELECT")).toBe("multiSelect");
    expect(filterableKindOf("RELATION")).toBe("relation");
    expect(filterableKindOf("FILE")).toBe("attachments");
    expect(filterableKindOf("ATTACHMENTS")).toBe("attachments");
  });

  it("resolves a FORMULA field through its inferred result type", () => {
    expect(filterableKindOf("FORMULA", { formulaExpression: "1 + 2" })).toBe("number");
    expect(filterableKindOf("FORMULA", { formulaExpression: "'a' & 'b'" })).toBe("text");
    expect(filterableKindOf("FORMULA", { formulaExpression: "1 > 2" })).toBe("boolean");
    expect(filterableKindOf("FORMULA", { formulaExpression: "now()" })).toBe("date");
  });

  it("falls back to text for a formula with no / a broken expression", () => {
    expect(filterableKindOf("FORMULA")).toBe("text");
    expect(filterableKindOf("FORMULA", { formulaExpression: "((( unbalanced" })).toBe("text");
  });
});
