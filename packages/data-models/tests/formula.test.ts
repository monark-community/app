import { describe, expect, it } from "vitest";
import {
  coerceFormulaResult,
  evaluateFormula,
  extractFieldRefs,
  FormulaError,
  parseFormula,
  tryEvaluateFormula,
} from "../src/contracts/formula";

// Pure unit tests for the formula expression engine — no DB. Covers the
// tokenizer/parser/evaluator, the function library, coercion, reference
// extraction, and error handling.

const evalWith = (expr: string, scope: Record<string, unknown> = {}) =>
  evaluateFormula(expr, scope);

describe("arithmetic + precedence", () => {
  it("evaluates arithmetic with correct precedence", () => {
    expect(evalWith("2 + 3 * 4")).toBe(14);
    expect(evalWith("(2 + 3) * 4")).toBe(20);
    expect(evalWith("10 - 4 - 3")).toBe(3); // left-associative
  });

  it("handles unary minus and modulo", () => {
    expect(evalWith("-5 + 2")).toBe(-3);
    expect(evalWith("10 % 3")).toBe(1);
    expect(evalWith("-(3 * 3)")).toBe(-9);
  });

  it("degrades divide-by-zero and non-numeric arithmetic to null", () => {
    expect(evalWith("1 / 0")).toBeNull();
    expect(evalWith("5 % 0")).toBeNull();
    expect(evalWith('"abc" + 1')).toBeNull();
  });
});

describe("string concatenation + comparisons", () => {
  it("concatenates with & (coercing each side to text)", () => {
    expect(evalWith('"Hello, " & name', { name: "World" })).toBe("Hello, World");
    expect(evalWith('"n=" & 42')).toBe("n=42");
    expect(evalWith('"x" & missing', {})).toBe("x"); // null → ""
  });

  it("binds & looser than arithmetic", () => {
    expect(evalWith('"total: " & 2 + 3')).toBe("total: 5");
  });

  it("compares numbers, strings, and equality", () => {
    expect(evalWith("3 > 2")).toBe(true);
    expect(evalWith("3 <= 3")).toBe(true);
    expect(evalWith('"a" < "b"')).toBe(true);
    expect(evalWith("1 == 1")).toBe(true);
    expect(evalWith('"x" != "y"')).toBe(true);
  });
});

describe("logic", () => {
  it("short-circuits && and ||", () => {
    expect(evalWith("true && false")).toBe(false);
    expect(evalWith("false || true")).toBe(true);
    expect(evalWith("!false")).toBe(true);
  });

  it("if/and/or/not/coalesce/isempty", () => {
    expect(evalWith('if(qty > 0, "in stock", "out")', { qty: 5 })).toBe("in stock");
    expect(evalWith("and(true, true, false)")).toBe(false);
    expect(evalWith("or(false, false, true)")).toBe(true);
    expect(evalWith("not(1 == 2)")).toBe(true);
    expect(evalWith("coalesce(missing, empty, 7)", { empty: "" })).toBe(7);
    expect(evalWith("isempty(x)", { x: "  " })).toBe(true);
    expect(evalWith("isempty(x)", { x: "hi" })).toBe(false);
  });
});

describe("number functions", () => {
  it("round/floor/ceil/abs/min/max/sum/avg/mod/pow", () => {
    expect(evalWith("round(3.14159, 2)")).toBe(3.14);
    expect(evalWith("round(2.5)")).toBe(3);
    expect(evalWith("floor(2.9)")).toBe(2);
    expect(evalWith("ceil(2.1)")).toBe(3);
    expect(evalWith("abs(-4)")).toBe(4);
    expect(evalWith("min(3, 1, 2)")).toBe(1);
    expect(evalWith("max(3, 1, 2)")).toBe(3);
    expect(evalWith("sum(1, 2, 3, 4)")).toBe(10);
    expect(evalWith("avg(2, 4, 6)")).toBe(4);
    expect(evalWith("mod(10, 3)")).toBe(1);
    expect(evalWith("pow(2, 10)")).toBe(1024);
  });
});

describe("string functions", () => {
  it("concat/upper/lower/trim/len/contains/replace/substring/left/right", () => {
    expect(evalWith('concat("a", "b", "c")')).toBe("abc");
    expect(evalWith('upper("hi")')).toBe("HI");
    expect(evalWith('lower("HI")')).toBe("hi");
    expect(evalWith('trim("  x  ")')).toBe("x");
    expect(evalWith('len("hello")')).toBe(5);
    expect(evalWith('contains("hello", "ell")')).toBe(true);
    expect(evalWith('replace("a-b-c", "-", "_")')).toBe("a_b_c");
    expect(evalWith('substring("hello", 1, 3)')).toBe("ell");
    expect(evalWith('left("hello", 2)')).toBe("he");
    expect(evalWith('right("hello", 2)')).toBe("lo");
  });
});

describe("date functions", () => {
  const base = new Date("2026-01-15T00:00:00.000Z");

  it("dateadd shifts by unit", () => {
    const r = evalWith('dateadd(d, 10, "days")', { d: base });
    expect(r).toBeInstanceOf(Date);
    expect((r as Date).toISOString().slice(0, 10)).toBe("2026-01-25");
    const m = evalWith('dateadd(d, 2, "months")', { d: base }) as Date;
    expect(m.toISOString().slice(0, 10)).toBe("2026-03-15");
  });

  it("datediff / year / month / day / formatdate", () => {
    const later = new Date("2026-01-25T00:00:00.000Z");
    expect(evalWith('datediff(b, a, "days")', { a: base, b: later })).toBe(10);
    expect(evalWith("year(d)", { d: base })).toBe(2026);
    expect(evalWith("month(d)", { d: base })).toBe(1);
    expect(evalWith("formatdate(d)", { d: base })).toBe("2026-01-15");
  });
});

describe("field references", () => {
  it("resolves references and normalizes arrays + missing values", () => {
    expect(evalWith("price * quantity", { price: 4, quantity: 3 })).toBe(12);
    expect(evalWith("tags", { tags: ["a", "b"] })).toBe("a, b");
    expect(evalWith("missing", {})).toBeNull();
  });

  it("extractFieldRefs returns referenced field keys only (not functions)", () => {
    expect(extractFieldRefs("round(price * qty, 2) & label").sort()).toEqual([
      "label",
      "price",
      "qty",
    ]);
    expect(extractFieldRefs("1 + 2")).toEqual([]);
  });
});

describe("result-type coercion", () => {
  it("coerces to the declared field type", () => {
    expect(coerceFormulaResult(3.2, "NUMBER")).toBe(3.2);
    expect(coerceFormulaResult("5", "NUMBER")).toBe(5);
    expect(coerceFormulaResult("abc", "NUMBER")).toBeNull();
    expect(coerceFormulaResult(42, "TEXT")).toBe("42");
    expect(coerceFormulaResult(null, "TEXT")).toBeNull();
    expect(coerceFormulaResult(0, "BOOLEAN")).toBe(false);
    expect(coerceFormulaResult(1, "BOOLEAN")).toBe(true);
    expect(coerceFormulaResult("2026-01-15", "DATE")).toBeInstanceOf(Date);
  });
});

describe("errors", () => {
  it("throws FormulaError on syntax errors and unknown functions", () => {
    expect(() => parseFormula("1 +")).toThrow(FormulaError);
    expect(() => parseFormula("(1 + 2")).toThrow(FormulaError);
    expect(() => parseFormula("bogus(1)")).toThrow(/Unknown function/);
    expect(() => parseFormula("round()")).toThrow(/expects/);
    expect(() => parseFormula("2 ^ 3")).toThrow(FormulaError); // ^ not a valid char
  });

  it("tryEvaluateFormula reports errors without throwing", () => {
    const bad = tryEvaluateFormula("1 +", {});
    expect(bad.ok).toBe(false);
    const good = tryEvaluateFormula("1 + 1", {});
    expect(good).toEqual({ ok: true, value: 2 });
  });
});
