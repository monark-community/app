export type WeekStartsOn = 0 | 1;
export type WeekdayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
export type TimeFormat = "12h" | "24h";

const WEEKDAY_KEYS: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function getWeekStart(date: Date, weekStartsOn: WeekStartsOn = 0): Date {
  const d = new Date(date);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isWeekendDay(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function buildWeekDays(weekStart: Date, opts?: { hideWeekends?: boolean }): Date[] {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return opts?.hideWeekends ? days.filter((d) => !isWeekendDay(d)) : days;
}

export function buildMonthGrid(
  year: number,
  month: number,
  weekStartsOn: WeekStartsOn = 0,
  opts?: { hideWeekends?: boolean },
): Date[][] {
  const firstOfMonth = new Date(year, month, 1);
  const offset = (firstOfMonth.getDay() - weekStartsOn + 7) % 7;
  const gridStart = addDays(firstOfMonth, -offset);
  return Array.from({ length: 6 }, (_, w) => buildWeekDays(addDays(gridStart, w * 7), opts));
}

export function getWeekdayLabels(
  weekStartsOn: WeekStartsOn,
  translate: (key: WeekdayKey) => string,
  opts?: { hideWeekends?: boolean },
): string[] {
  const rotated = [...WEEKDAY_KEYS.slice(weekStartsOn), ...WEEKDAY_KEYS.slice(0, weekStartsOn)];
  const filtered = opts?.hideWeekends ? rotated.filter((key) => !isWeekendKey(key)) : rotated;
  return filtered.map(translate);
}

function isWeekendKey(key: WeekdayKey): boolean {
  return key === "sun" || key === "sat";
}

export function formatClockTime(date: Date, timeFormat: TimeFormat = "24h"): string {
  const minutes = String(date.getMinutes()).padStart(2, "0");
  if (timeFormat === "24h") {
    return `${String(date.getHours()).padStart(2, "0")}:${minutes}`;
  }
  const hours24 = date.getHours();
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
}

export function formatHourLabel(hour: number, timeFormat: TimeFormat = "24h"): string {
  if (timeFormat === "24h") {
    return `${String(hour % 24).padStart(2, "0")}:00`;
  }
  const period = hour % 24 >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12} ${period}`;
}
