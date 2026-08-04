import { describe, expect, it } from "vitest";
import {
  isQueryVariable,
  resolveQueryVariable,
  variablesForKind,
} from "../src/contracts/query-variables";

// Fixed "now" — Wednesday 2026-08-05 14:30 UTC.
const NOW = new Date("2026-08-05T14:30:00.000Z");
const CTX = { userId: "user_42", now: NOW };

describe("isQueryVariable", () => {
  it("detects the @ prefix", () => {
    expect(isQueryVariable("@me")).toBe(true);
    expect(isQueryVariable("open")).toBe(false);
  });
});

describe("resolveQueryVariable", () => {
  it("@me → caller id", () => {
    expect(resolveQueryVariable("@me", CTX)).toBe("user_42");
  });

  it("absolute date anchors (UTC)", () => {
    expect(resolveQueryVariable("@today", CTX)).toBe("2026-08-05T00:00:00.000Z");
    expect(resolveQueryVariable("@yesterday", CTX)).toBe("2026-08-04T00:00:00.000Z");
    expect(resolveQueryVariable("@startOfMonth", CTX)).toBe("2026-08-01T00:00:00.000Z");
    expect(resolveQueryVariable("@endOfYear", CTX)).toBe("2027-01-01T00:00:00.000Z");
  });

  it("@startOfWeek is the Monday, endOfWeek is +7 days", () => {
    const start = new Date(resolveQueryVariable("@startOfWeek", CTX)!);
    const end = new Date(resolveQueryVariable("@endOfWeek", CTX)!);
    expect(start.getUTCDay()).toBe(1);
    expect(end.getTime() - start.getTime()).toBe(7 * 86_400_000);
    expect(resolveQueryVariable("@startOfWeek", CTX)).toBe("2026-08-03T00:00:00.000Z");
  });

  it("unknown → null", () => {
    expect(resolveQueryVariable("@nope", CTX)).toBeNull();
  });
});

describe("variablesForKind", () => {
  it("date anchors for date, @me for relation, none for text", () => {
    expect(variablesForKind("date").map((v) => v.token)).toContain("@today");
    expect(variablesForKind("relation").map((v) => v.token)).toEqual(["@me"]);
    expect(variablesForKind("text")).toEqual([]);
  });
});
