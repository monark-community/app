import { createEvents, type DateArray, type EventAttributes } from "ics";
import ical from "node-ical";
import type { CalendarEventRow } from "./data";

// ── Export ────────────────────────────────────────────────

function toUtcDateTimeArray(d: Date): DateArray {
  return [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
  ];
}

function toUtcDateOnlyArray(d: Date): DateArray {
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

export function generateIcsForEvents(events: CalendarEventRow[]): string {
  const attrs: EventAttributes[] = events.map((ev) => ({
    uid: `${ev.id}@monark`,
    title: ev.title,
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    created: toUtcDateTimeArray(ev.createdAt),
    lastModified: toUtcDateTimeArray(ev.updatedAt),
    ...(ev.eventType === "ALL_DAY"
      ? { start: toUtcDateOnlyArray(ev.startAt), end: toUtcDateOnlyArray(ev.endAt) }
      : {
          start: toUtcDateTimeArray(ev.startAt),
          startInputType: "utc" as const,
          end: toUtcDateTimeArray(ev.endAt),
          endInputType: "utc" as const,
        }),
  }));

  const { error, value } = createEvents(attrs, { productId: "-//Monark//Calendar//EN" });
  if (error || value === null) {
    throw new Error(`ICS generation failed: ${error?.message ?? "unknown error"}`);
  }
  return value;
}

// ── Import ────────────────────────────────────────────────

export type ParsedIcsEvent = {
  title: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  eventType: "STANDARD" | "ALL_DAY";
  hadRecurrence: boolean;
};

// `summary`/`description`/`location` are either a plain string or a
// `{ val, params }` wrapper carrying ICS parameters (e.g. LANGUAGE) —
// this always extracts the text.
function textValue(v: string | { val: string } | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === "string" ? v : v.val;
}

export function parseIcsEvents(icsText: string): ParsedIcsEvent[] {
  const parsed = ical.sync.parseICS(icsText);
  const events: ParsedIcsEvent[] = [];

  for (const key of Object.keys(parsed)) {
    const item = parsed[key];
    if (!item || item.type !== "VEVENT") continue;

    const startAt = new Date(item.start);
    const isAllDay = item.datetype === "date";
    // ICS DTEND is exclusive for DATE-valued (all-day) events, matching this
    // app's own ALL_DAY convention ; when a source calendar omits DTEND on a
    // single-day all-day event, default to the next day rather than an
    // empty (startAt === endAt) range, which would never match any
    // date-range query.
    const endAt = item.end
      ? new Date(item.end)
      : isAllDay
        ? new Date(startAt.getTime() + 24 * 60 * 60 * 1000)
        : startAt;

    events.push({
      title: textValue(item.summary) ?? "Untitled",
      description: textValue(item.description),
      location: textValue(item.location),
      startAt,
      endAt,
      eventType: isAllDay ? "ALL_DAY" : "STANDARD",
      hadRecurrence: item.rrule != null,
    });
  }

  return events;
}
