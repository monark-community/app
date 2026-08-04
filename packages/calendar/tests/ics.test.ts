import { describe, it, expect } from "vitest";
import { generateIcsForEvents, parseIcsEvents } from "../src/server/ics";
import type { CalendarEventRow } from "../src/server/data";

function fakeEventRow(over: Partial<CalendarEventRow> = {}): CalendarEventRow {
  return {
    id: "evt-1",
    calendarId: "cal-1",
    organizationId: "org-1",
    title: "Sprint planning",
    description: "Weekly sync",
    location: "Room A",
    participants: [],
    startAt: new Date("2026-06-15T09:00:00.000Z"),
    endAt: new Date("2026-06-15T10:00:00.000Z"),
    eventType: "STANDARD",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    deletedAt: null,
    sourceModule: null,
    sourceRecordId: null,
    reminders: [],
    ...over,
  } as CalendarEventRow;
}

describe("generateIcsForEvents", () => {
  it("produces a VCALENDAR with a timed VEVENT carrying the right UTC instant", () => {
    const ics = generateIcsForEvents([fakeEventRow()]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Sprint planning");
    expect(ics).toContain("LOCATION:Room A");
    expect(ics).toContain("UID:evt-1@monark");
    expect(ics).toContain("DTSTART:20260615T090000Z");
    expect(ics).toContain("DTEND:20260615T100000Z");
  });

  it("emits a date-only DTSTART/DTEND for an ALL_DAY event", () => {
    const ics = generateIcsForEvents([
      fakeEventRow({
        eventType: "ALL_DAY",
        startAt: new Date("2026-06-15T00:00:00.000Z"),
        endAt: new Date("2026-06-17T00:00:00.000Z"), // exclusive : spans the 15th-16th
      }),
    ]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260615");
    expect(ics).toContain("DTEND;VALUE=DATE:20260617");
  });

  it("returns a valid (if empty) calendar for zero events", () => {
    const ics = generateIcsForEvents([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});

describe("parseIcsEvents", () => {
  it("parses a timed VEVENT", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//test//EN",
      "BEGIN:VEVENT",
      "UID:test-1@example.com",
      "DTSTAMP:20260601T000000Z",
      "DTSTART:20260615T090000Z",
      "DTEND:20260615T100000Z",
      "SUMMARY:Standup",
      "DESCRIPTION:Daily sync",
      "LOCATION:Zoom",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const events = parseIcsEvents(ics);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Standup",
      description: "Daily sync",
      location: "Zoom",
      eventType: "STANDARD",
      hadRecurrence: false,
    });
    expect(events[0]!.startAt.toISOString()).toBe("2026-06-15T09:00:00.000Z");
    expect(events[0]!.endAt.toISOString()).toBe("2026-06-15T10:00:00.000Z");
  });

  it("detects an all-day VEVENT via the DATE-valued DTSTART", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//test//EN",
      "BEGIN:VEVENT",
      "UID:test-2@example.com",
      "DTSTAMP:20260601T000000Z",
      "DTSTART;VALUE=DATE:20260620",
      "DTEND;VALUE=DATE:20260622",
      "SUMMARY:Offsite",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const events = parseIcsEvents(ics);
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("ALL_DAY");
    expect(events[0]!.title).toBe("Offsite");
  });

  it("flags recurrence via RRULE without expanding occurrences", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//test//EN",
      "BEGIN:VEVENT",
      "UID:test-3@example.com",
      "DTSTAMP:20260601T000000Z",
      "DTSTART:20260601T090000Z",
      "DTEND:20260601T093000Z",
      "SUMMARY:Weekly sync",
      "RRULE:FREQ=WEEKLY;COUNT=5",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const events = parseIcsEvents(ics);
    expect(events).toHaveLength(1);
    expect(events[0]!.hadRecurrence).toBe(true);
  });

  it("ignores non-VEVENT components (e.g. VTIMEZONE)", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//test//EN",
      "BEGIN:VTIMEZONE",
      "TZID:America/New_York",
      "END:VTIMEZONE",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseIcsEvents(ics)).toHaveLength(0);
  });

  it("round-trips through generateIcsForEvents", () => {
    const original = fakeEventRow({ title: "Retro", description: undefined, location: undefined });
    const ics = generateIcsForEvents([original]);
    const [parsed] = parseIcsEvents(ics);
    expect(parsed).toBeDefined();
    expect(parsed!.title).toBe("Retro");
    expect(parsed!.startAt.toISOString()).toBe(original.startAt.toISOString());
    expect(parsed!.endAt.toISOString()).toBe(original.endAt.toISOString());
  });
});
