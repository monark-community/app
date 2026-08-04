import { describe, it, expect } from "vitest";
import {
  addDays,
  buildMonthGrid,
  buildWeekDays,
  formatClockTime,
  formatHourLabel,
  getWeekdayLabels,
  getWeekStart,
  isWeekendDay,
} from "../src/client/date-utils";

// A Wednesday, chosen so week-start math for both Sunday- and Monday-first
// weeks lands on unambiguous, easy-to-check dates.
const WED = new Date(2026, 0, 21);

describe("getWeekStart", () => {
  it("defaults to Sunday-first", () => {
    expect(getWeekStart(WED)).toEqual(new Date(2026, 0, 18));
  });

  it("supports Monday-first", () => {
    expect(getWeekStart(WED, 1)).toEqual(new Date(2026, 0, 19));
  });

  it("Sunday-first: a Sunday is its own week start", () => {
    const sun = new Date(2026, 0, 18);
    expect(getWeekStart(sun, 0)).toEqual(sun);
  });

  it("Monday-first: a Sunday belongs to the previous week", () => {
    const sun = new Date(2026, 0, 25);
    expect(getWeekStart(sun, 1)).toEqual(new Date(2026, 0, 19));
  });
});

describe("buildWeekDays", () => {
  const weekStart = new Date(2026, 0, 18); // Sunday

  it("returns 7 days unfiltered", () => {
    const days = buildWeekDays(weekStart);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual(weekStart);
    expect(days[6]).toEqual(new Date(2026, 0, 24));
  });

  it("filters weekends down to 5 days, still calendar-contiguous", () => {
    const days = buildWeekDays(weekStart, { hideWeekends: true });
    expect(days).toHaveLength(5);
    expect(days.every((d) => !isWeekendDay(d))).toBe(true);
    expect(days[0]).toEqual(new Date(2026, 0, 19)); // Mon
    expect(days[4]).toEqual(new Date(2026, 0, 23)); // Fri
  });
});

describe("isWeekendDay", () => {
  it("flags Saturday and Sunday only", () => {
    expect(isWeekendDay(new Date(2026, 0, 18))).toBe(true); // Sun
    expect(isWeekendDay(new Date(2026, 0, 24))).toBe(true); // Sat
    expect(isWeekendDay(new Date(2026, 0, 19))).toBe(false); // Mon
    expect(isWeekendDay(WED)).toBe(false);
  });
});

describe("buildMonthGrid", () => {
  it("always returns 6 weeks, each a full 7 days when not filtered", () => {
    const grid = buildMonthGrid(2026, 0); // January 2026, Sunday-first
    expect(grid).toHaveLength(6);
    for (const week of grid) expect(week).toHaveLength(7);
    // Jan 1, 2026 is a Thursday ; Sunday-first grid starts on Dec 28, 2025.
    expect(grid[0]![0]).toEqual(new Date(2025, 11, 28));
  });

  it("shifts the grid start for Monday-first weeks", () => {
    const grid = buildMonthGrid(2026, 0, 1);
    expect(grid[0]![0]).toEqual(new Date(2025, 11, 29));
  });

  it("filters weekends to 5 columns per week, every row", () => {
    const grid = buildMonthGrid(2026, 0, 0, { hideWeekends: true });
    expect(grid).toHaveLength(6);
    for (const week of grid) {
      expect(week).toHaveLength(5);
      expect(week.every((d) => !isWeekendDay(d))).toBe(true);
    }
  });
});

describe("getWeekdayLabels", () => {
  const translate = (key: string) => key.toUpperCase();

  it("rotates labels to the given week start", () => {
    expect(getWeekdayLabels(0, translate)).toEqual([
      "SUN",
      "MON",
      "TUE",
      "WED",
      "THU",
      "FRI",
      "SAT",
    ]);
    expect(getWeekdayLabels(1, translate)).toEqual([
      "MON",
      "TUE",
      "WED",
      "THU",
      "FRI",
      "SAT",
      "SUN",
    ]);
  });

  it("drops weekend labels when hidden, preserving order", () => {
    expect(getWeekdayLabels(0, translate, { hideWeekends: true })).toEqual([
      "MON",
      "TUE",
      "WED",
      "THU",
      "FRI",
    ]);
    expect(getWeekdayLabels(1, translate, { hideWeekends: true })).toEqual([
      "MON",
      "TUE",
      "WED",
      "THU",
      "FRI",
    ]);
  });
});

describe("addDays", () => {
  it("adds and subtracts across month boundaries", () => {
    expect(addDays(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 1));
    expect(addDays(new Date(2026, 1, 1), -1)).toEqual(new Date(2026, 0, 31));
  });
});

describe("formatClockTime", () => {
  it("formats 24h with zero-padding", () => {
    expect(formatClockTime(new Date(2026, 0, 1, 9, 5), "24h")).toBe("09:05");
    expect(formatClockTime(new Date(2026, 0, 1, 23, 0), "24h")).toBe("23:00");
  });

  it("formats 12h with AM/PM and midnight/noon as 12", () => {
    expect(formatClockTime(new Date(2026, 0, 1, 0, 0), "12h")).toBe("12:00 AM");
    expect(formatClockTime(new Date(2026, 0, 1, 12, 0), "12h")).toBe("12:00 PM");
    expect(formatClockTime(new Date(2026, 0, 1, 13, 30), "12h")).toBe("1:30 PM");
  });
});

describe("formatHourLabel", () => {
  it("formats 24h hour labels", () => {
    expect(formatHourLabel(0, "24h")).toBe("00:00");
    expect(formatHourLabel(13, "24h")).toBe("13:00");
  });

  it("formats 12h hour labels", () => {
    expect(formatHourLabel(0, "12h")).toBe("12 AM");
    expect(formatHourLabel(12, "12h")).toBe("12 PM");
    expect(formatHourLabel(15, "12h")).toBe("3 PM");
  });
});
