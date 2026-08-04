import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRelativeTime } from "@/lib/format-time";

// Locale-aware relative-time bucketing. A fixed system clock makes the
// bucket boundaries (second → minute → hour → day → month → year)
// deterministic ; the exact phrasing comes from Intl, so we assert on the
// unit word rather than pinning ICU's wording.

const NOW = new Date("2026-08-04T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const ago = (ms: number) => new Date(NOW.getTime() - ms);
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  it("buckets into the largest unit that resolves to >= 1", () => {
    expect(formatRelativeTime(ago(5 * SEC), "en")).toMatch(/second/);
    expect(formatRelativeTime(ago(5 * MIN), "en")).toMatch(/minute/);
    expect(formatRelativeTime(ago(5 * HOUR), "en")).toMatch(/hour/);
    expect(formatRelativeTime(ago(5 * DAY), "en")).toMatch(/day/);
    expect(formatRelativeTime(ago(90 * DAY), "en")).toMatch(/month/);
    expect(formatRelativeTime(ago(400 * DAY), "en")).toMatch(/year/);
  });

  it("uses numeric:auto phrasing for the sub-minute 'now' case", () => {
    expect(formatRelativeTime(NOW, "en")).toBe("now");
  });

  it("handles future instants", () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 5 * MIN), "en")).toMatch(/minute/);
  });

  it("accepts an ISO string and respects the locale", () => {
    expect(formatRelativeTime(ago(5 * MIN).toISOString(), "en")).toMatch(/minute/);
    // fr keeps its own wording ("il y a 5 minutes") — same unit stem.
    expect(formatRelativeTime(ago(5 * MIN), "fr")).toMatch(/minute/);
  });
});
