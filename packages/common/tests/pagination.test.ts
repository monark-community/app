import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  cursorFindArgs,
  resolveLimit,
  toPage,
} from "../src/pagination";

// Pure keyset-pagination helpers shared by every "GET ALL" list method. The
// off-by-one in the over-fetch / slice is the whole point of the convention, so
// these pin it down.

describe("resolveLimit", () => {
  it("defaults when the limit is missing or not finite", () => {
    expect(resolveLimit()).toBe(DEFAULT_PAGE_SIZE);
    expect(resolveLimit(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(resolveLimit(Number.NaN)).toBe(DEFAULT_PAGE_SIZE);
    expect(resolveLimit(Infinity)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("clamps into [1, MAX_PAGE_SIZE] and truncates fractionals", () => {
    expect(resolveLimit(0)).toBe(1);
    expect(resolveLimit(-10)).toBe(1);
    expect(resolveLimit(10)).toBe(10);
    expect(resolveLimit(10.9)).toBe(10);
    expect(resolveLimit(MAX_PAGE_SIZE + 500)).toBe(MAX_PAGE_SIZE);
  });
});

describe("cursorFindArgs", () => {
  it("over-fetches one row and omits cursor/skip on the first page", () => {
    expect(cursorFindArgs(25)).toEqual({ take: 26 });
    expect(cursorFindArgs(25, null)).toEqual({ take: 26 });
  });

  it("adds cursor + skip:1 on a subsequent page", () => {
    expect(cursorFindArgs(25, "row_42")).toEqual({ take: 26, cursor: { id: "row_42" }, skip: 1 });
  });
});

describe("toPage", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}` }));

  it("trims the over-fetched row and sets nextCursor to the last kept id", () => {
    // limit 2, over-fetched 3 rows → there IS a next page.
    const page = toPage(rows(3), 100, 2);
    expect(page.items.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(page.nextCursor).toBe("r2");
    expect(page.total).toBe(100);
  });

  it("returns nextCursor null on the last (not-over-fetched) page", () => {
    const page = toPage(rows(2), 2, 25);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("handles an empty result", () => {
    const page = toPage([], 0, 25);
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(page.total).toBe(0);
  });

  it("treats exactly `limit` rows as the last page (no phantom next page)", () => {
    const page = toPage(rows(25), 25, 25);
    expect(page.items).toHaveLength(25);
    expect(page.nextCursor).toBeNull();
  });
});
