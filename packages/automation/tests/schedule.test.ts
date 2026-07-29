import { describe, expect, it } from "vitest";
import { nextFireTime, type AutomationSchedule } from "../src/contracts/schedule";

// Pure UTC schedule engine — covers the four example patterns the feature calls
// out plus the day-of-month edges. No DB / timezone : everything is UTC.

const DAY_MS = 86_400_000;
const at = (iso: string) => new Date(iso);
/** Assert non-null and narrow (keeps the `!`-free lint rule happy). */
function req(d: Date | null): Date {
  if (d === null) throw new Error("expected a fire time, got null");
  return d;
}

describe("nextFireTime — interval (every 20 minutes)", () => {
  const s: AutomationSchedule = { kind: "interval", everyMinutes: 20 };
  it("aligns to the :00/:20/:40 grid, strictly after", () => {
    expect(req(nextFireTime(s, at("2026-03-10T08:35:00Z"))).toISOString()).toBe(
      "2026-03-10T08:40:00.000Z",
    );
    expect(req(nextFireTime(s, at("2026-03-10T08:40:00Z"))).toISOString()).toBe(
      "2026-03-10T09:00:00.000Z",
    );
  });
});

describe("nextFireTime — daily (every day at 09:00)", () => {
  const s: AutomationSchedule = {
    kind: "daily",
    time: { hour: 9, minute: 0 },
    everyDays: 1,
    anchor: "2026-01-01",
  };
  it("today if before 09:00, next day if at/after", () => {
    expect(req(nextFireTime(s, at("2026-03-10T08:30:00Z"))).toISOString()).toBe(
      "2026-03-10T09:00:00.000Z",
    );
    expect(req(nextFireTime(s, at("2026-03-10T09:00:00Z"))).toISOString()).toBe(
      "2026-03-11T09:00:00.000Z",
    );
  });
});

describe("nextFireTime — weekly (every 2 weeks on Wednesday)", () => {
  const s: AutomationSchedule = {
    kind: "weekly",
    time: { hour: 9, minute: 0 },
    weekdays: [3],
    everyWeeks: 2,
    anchor: "2026-03-01",
  };
  it("fires on a Wednesday at 09:00, spaced exactly 2 weeks", () => {
    const first = req(nextFireTime(s, at("2026-03-01T00:00:00Z")));
    expect(first.getUTCDay()).toBe(3);
    expect(first.getUTCHours()).toBe(9);
    const second = req(nextFireTime(s, first));
    expect(second.getUTCDay()).toBe(3);
    expect(second.getTime() - first.getTime()).toBe(14 * DAY_MS);
  });
});

describe("nextFireTime — monthly on the second Wednesday", () => {
  const s: AutomationSchedule = {
    kind: "monthly-nth-weekday",
    time: { hour: 8, minute: 0 },
    nth: 2,
    weekday: 3,
  };
  it("fires on the 2nd Wednesday (date 8–14) at 08:00, once a month", () => {
    const first = req(nextFireTime(s, at("2026-03-01T00:00:00Z")));
    expect(first.getUTCDay()).toBe(3);
    expect(first.getUTCDate()).toBeGreaterThanOrEqual(8);
    expect(first.getUTCDate()).toBeLessThanOrEqual(14);
    expect(first.getUTCHours()).toBe(8);
    const second = req(nextFireTime(s, first));
    expect(second.getUTCDay()).toBe(3);
    expect(second.getUTCDate()).toBeGreaterThanOrEqual(8);
    expect(second.getUTCDate()).toBeLessThanOrEqual(14);
    // The following month.
    expect((second.getUTCMonth() - first.getUTCMonth() + 12) % 12).toBe(1);
  });
});

describe("nextFireTime — monthly on a day-of-month", () => {
  it("a fixed day, and the last day (-1)", () => {
    const d15: AutomationSchedule = { kind: "monthly-day", time: { hour: 0, minute: 0 }, day: 15 };
    expect(req(nextFireTime(d15, at("2026-03-10T00:00:00Z"))).toISOString()).toBe(
      "2026-03-15T00:00:00.000Z",
    );
    const last: AutomationSchedule = { kind: "monthly-day", time: { hour: 0, minute: 0 }, day: -1 };
    // February 2026 (not a leap year) → the 28th.
    expect(req(nextFireTime(last, at("2026-02-10T00:00:00Z"))).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });
});
