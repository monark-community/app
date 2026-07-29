import { z } from "zod";
import { SCHEDULE_TRIGGER_TYPE } from "./triggers";
import type { AutomationGraph } from "./graph";

/**
 * A cron-like schedule for the Scheduled Trigger node. **Everything is UTC** —
 * the engine computes fire times with plain `Date` UTC methods (no timezone
 * library, DST-proof). The editor enters/displays the wall-clock in the user's
 * local timezone and converts to/from UTC at the storage boundary.
 *
 * Kinds cover the common cron patterns and then some :
 *  - `interval`            — every N minutes ("every 20 minutes"), grid-aligned.
 *  - `daily`               — every N days at HH:MM ("every day at 09:00").
 *  - `weekly`              — every N weeks on weekday(s) at HH:MM ("every 2 weeks on Mon").
 *  - `monthly-day`         — monthly on day-of-month (or last) at HH:MM.
 *  - `monthly-nth-weekday` — monthly on the Nth (or last) weekday at HH:MM
 *                            ("the second Wednesday at 08:00").
 */

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Weekday in UTC : 0 = Sunday … 6 = Saturday (matches `Date.getUTCDay()`). */
export const weekdaySchema = z.number().int().min(0).max(6);

const timeOfDaySchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});
export type TimeOfDay = z.infer<typeof timeOfDaySchema>;

/** ISO calendar date "YYYY-MM-DD" (UTC) a recurring cycle counts from. */
const anchorSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The Nth occurrence in a month : 1st–4th, or -1 for the last. */
const nthSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]);

export const automationScheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("interval"), everyMinutes: z.number().int().min(1).max(10080) }),
  z.object({
    kind: z.literal("daily"),
    time: timeOfDaySchema,
    everyDays: z.number().int().min(1).max(366),
    anchor: anchorSchema,
  }),
  z.object({
    kind: z.literal("weekly"),
    time: timeOfDaySchema,
    weekdays: z.array(weekdaySchema).min(1),
    everyWeeks: z.number().int().min(1).max(52),
    anchor: anchorSchema,
  }),
  z.object({
    kind: z.literal("monthly-day"),
    time: timeOfDaySchema,
    // 1–31, or -1 for the last day of the month.
    day: z
      .number()
      .int()
      .min(-1)
      .max(31)
      .refine((d) => d !== 0, "day cannot be 0"),
  }),
  z.object({
    kind: z.literal("monthly-nth-weekday"),
    time: timeOfDaySchema,
    nth: nthSchema,
    weekday: weekdaySchema,
  }),
]);

export type AutomationSchedule = z.infer<typeof automationScheduleSchema>;

// ── next-fire computation (all UTC) ───────────────────────

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function anchorMidnight(anchor: string): number {
  const [y, m, d] = anchor.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}
function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}
/** Midnight of the (Sunday-start) week containing `ms`. */
function weekStart(ms: number): number {
  return ms - new Date(ms).getUTCDay() * DAY_MS;
}

/** Whether a given UTC calendar day (its 00:00 instant) is an on-cycle fire day. */
function matchesDay(schedule: AutomationSchedule, dayStart: number): boolean {
  const d = new Date(dayStart);
  switch (schedule.kind) {
    case "daily": {
      const a = anchorMidnight(schedule.anchor);
      if (dayStart < a) return false;
      return Math.round((dayStart - a) / DAY_MS) % schedule.everyDays === 0;
    }
    case "weekly": {
      if (!schedule.weekdays.includes(d.getUTCDay())) return false;
      const anchorWeek = weekStart(anchorMidnight(schedule.anchor));
      if (weekStart(dayStart) < anchorWeek) return false;
      const weeks = Math.round((weekStart(dayStart) - anchorWeek) / WEEK_MS);
      return weeks % schedule.everyWeeks === 0;
    }
    case "monthly-day": {
      const dim = daysInMonth(d.getUTCFullYear(), d.getUTCMonth());
      const target = schedule.day === -1 ? dim : schedule.day;
      return d.getUTCDate() === target;
    }
    case "monthly-nth-weekday": {
      if (d.getUTCDay() !== schedule.weekday) return false;
      if (schedule.nth === -1) {
        // The last such weekday : no further same-weekday day fits this month.
        return d.getUTCDate() + 7 > daysInMonth(d.getUTCFullYear(), d.getUTCMonth());
      }
      return Math.floor((d.getUTCDate() - 1) / 7) + 1 === schedule.nth;
    }
    default:
      return false;
  }
}

/**
 * The next UTC instant strictly after `after` that this schedule fires, or
 * `null` if none within a generous horizon (shouldn't happen for a valid
 * schedule). Interval schedules align to the epoch grid (e.g. every 20 min →
 * :00 / :20 / :40) ; time-of-day schedules step day-by-day in UTC.
 */
export function nextFireTime(schedule: AutomationSchedule, after: Date): Date | null {
  if (schedule.kind === "interval") {
    const ms = schedule.everyMinutes * 60_000;
    return new Date((Math.floor(after.getTime() / ms) + 1) * ms);
  }
  const { hour, minute } = schedule.time;
  const startDay = utcMidnight(after);
  const MAX_DAYS = 366 * 5; // ~5 years : covers everyDays≤366 / everyWeeks≤52
  for (let i = 0; i < MAX_DAYS; i++) {
    const dayStart = startDay + i * DAY_MS;
    if (!matchesDay(schedule, dayStart)) continue;
    const dd = new Date(dayStart);
    const fire = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate(), hour, minute);
    if (fire > after.getTime()) return new Date(fire);
  }
  return null;
}

/**
 * Pull the schedule config off a graph's Scheduled Trigger node, or `null` if
 * the graph has no scheduled trigger / an invalid config. Used server-side to
 * (re)compute `Automation.scheduleNextRunAt` and to advance it as runs fire.
 */
export function scheduleFromGraph(graph: AutomationGraph): AutomationSchedule | null {
  const node = graph.nodes.find((n) => n.type === SCHEDULE_TRIGGER_TYPE);
  if (!node) return null;
  const parsed = automationScheduleSchema.safeParse(
    (node.config as { schedule?: unknown } | undefined)?.schedule,
  );
  return parsed.success ? parsed.data : null;
}
