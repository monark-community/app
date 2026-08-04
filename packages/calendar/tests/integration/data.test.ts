import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import {
  createCalendar,
  createCalendarEvent,
  ensurePersonalCalendar,
  findCalendarById,
  findCalendarEventById,
  findOverlappingEvents,
  getPendingReminders,
  listAccessibleCalendars,
  listCalendarMembers,
  listEventsForDay,
  listEventsPaginated,
  markReminderNotified,
  restoreCalendar,
  searchCalendarEvents,
  setCalendarRoleAccess,
  softDeleteCalendar,
  softDeleteCalendarEvent,
  updateCalendar,
  updateCalendarEvent,
} from "../../src/server/data";

// Integration tests for the calendar data layer (calendar + event CRUD,
// role-scoped visibility, day/range queries, search, reminder scheduling +
// delivery, and members resolution) against a real Postgres. The materialize-
// from-source path is covered by data-model-subscriber.test.ts ; this pins the
// rest, which the tRPC router + reminder cron lean on directly.

const ORG = "cal-data-org";
const ORG_OTHER = "cal-data-org-b";
const U1 = "cal-data-u1";
const U2 = "cal-data-u2";
let roleId = ""; // a role U1 holds and U2 doesn't (for role-scoped access/members)

beforeAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: { in: [ORG, ORG_OTHER] } } });
  await db.user.deleteMany({ where: { id: { in: [U1, U2] } } });
  for (const id of [ORG, ORG_OTHER]) {
    await db.organization.create({ data: { id, slug: id, displayName: id } });
  }
  for (const id of [U1, U2]) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }
  const role = await db.role.create({
    data: { key: "cal-role", name: "Cal Role", organizationId: ORG },
  });
  roleId = role.id;
  await db.roleAssignment.create({ data: { userId: U1, roleId, organizationId: ORG } });
});

afterEach(async () => {
  await truncate(getDb(), [
    "CalendarEventReminder",
    "CalendarEvent",
    "CalendarRoleAccess",
    "Calendar",
  ]);
});

afterAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: { in: [ORG, ORG_OTHER] } } });
  await db.user.deleteMany({ where: { id: { in: [U1, U2] } } });
});

const cal = (over: Partial<Parameters<typeof createCalendar>[0]> = {}) =>
  createCalendar({ organizationId: ORG, name: "Team", ...over });

describe("calendar CRUD", () => {
  it("creates, reads, updates, soft-deletes, and restores a calendar", async () => {
    const created = await cal({ name: "Ops", color: "#abc" });
    expect(created.name).toBe("Ops");
    expect(await findCalendarById(created.id)).not.toBeNull();

    const updated = await updateCalendar(created.id, { name: "Ops v2", description: "d" });
    expect(updated.name).toBe("Ops v2");
    expect(updated.description).toBe("d");

    await softDeleteCalendar(created.id);
    expect(await findCalendarById(created.id)).toBeNull();
    expect(await findCalendarById(created.id, { includeDeleted: true })).not.toBeNull();

    await restoreCalendar(created.id);
    expect(await findCalendarById(created.id)).not.toBeNull();
  });
});

describe("listAccessibleCalendars — role-scoped visibility", () => {
  it("hides role-restricted calendars from users without a matching role, shows them to managers", async () => {
    const open = await cal({ name: "Open" }); // no role access → visible to all
    const restricted = await cal({ name: "Restricted" });
    await setCalendarRoleAccess(restricted.id, [roleId]);

    // Manager sees everything.
    const asManager = await listAccessibleCalendars({
      organizationId: ORG,
      roleIds: [],
      hasManagedPermission: true,
    });
    expect(asManager.map((c) => c.id).sort()).toEqual([open.id, restricted.id].sort());

    // No matching role → only the unrestricted calendar.
    const noRole = await listAccessibleCalendars({
      organizationId: ORG,
      roleIds: [],
      hasManagedPermission: false,
    });
    expect(noRole.map((c) => c.id)).toEqual([open.id]);

    // Matching role → both.
    const withRole = await listAccessibleCalendars({
      organizationId: ORG,
      roleIds: [roleId],
      hasManagedPermission: false,
    });
    expect(withRole.map((c) => c.id).sort()).toEqual([open.id, restricted.id].sort());
  });

  it("excludes archived calendars unless includeDeleted is set", async () => {
    const c = await cal({ name: "Archived" });
    await softDeleteCalendar(c.id);
    const active = await listAccessibleCalendars({
      organizationId: ORG,
      roleIds: [],
      hasManagedPermission: true,
    });
    expect(active.map((x) => x.id)).not.toContain(c.id);
    const all = await listAccessibleCalendars({
      organizationId: ORG,
      roleIds: [],
      hasManagedPermission: true,
      includeDeleted: true,
    });
    expect(all.map((x) => x.id)).toContain(c.id);
  });
});

describe("ensurePersonalCalendar", () => {
  it("creates a personal calendar when none exists", async () => {
    const personal = await ensurePersonalCalendar({ organizationId: ORG });
    expect(personal.isPersonal).toBe(true);
    // Idempotent : a second call returns the same row, not a duplicate.
    const again = await ensurePersonalCalendar({ organizationId: ORG });
    expect(again.id).toBe(personal.id);
  });

  it("backfills the oldest existing calendar as personal", async () => {
    const first = await cal({ name: "Legacy" }); // not personal
    const personal = await ensurePersonalCalendar({ organizationId: ORG });
    expect(personal.id).toBe(first.id);
    expect(personal.isPersonal).toBe(true);
  });
});

describe("setCalendarRoleAccess", () => {
  it("replaces the role-access set", async () => {
    const c = await cal();
    await setCalendarRoleAccess(c.id, [roleId]);
    expect((await findCalendarById(c.id))?.roleAccess.map((r) => r.roleId)).toEqual([roleId]);
    await setCalendarRoleAccess(c.id, []);
    expect((await findCalendarById(c.id))?.roleAccess).toHaveLength(0);
  });
});

describe("calendar events", () => {
  const day = (h: number) => new Date(`2026-05-10T${String(h).padStart(2, "0")}:00:00Z`);

  it("creates an event with reminders, lists it by overlapping window, and hides non-overlaps", async () => {
    const c = await cal();
    const event = await createCalendarEvent({
      calendarId: c.id,
      organizationId: ORG,
      title: "Standup",
      startAt: day(10),
      endAt: day(11),
      reminderMinutes: [10, 30],
    });
    expect(event.reminders.map((r) => r.minutesBefore).sort((a, b) => a - b)).toEqual([10, 30]);

    const overlapping = await listEventsForDay({
      organizationId: ORG,
      calendarIds: [c.id],
      startAt: day(9),
      endAt: day(12),
    });
    expect(overlapping.map((e) => e.id)).toEqual([event.id]);

    const later = await listEventsForDay({
      organizationId: ORG,
      calendarIds: [c.id],
      startAt: day(12),
      endAt: day(13),
    });
    expect(later).toHaveLength(0);
  });

  it("updates fields + replaces reminders, and soft-deletes", async () => {
    const c = await cal();
    const event = await createCalendarEvent({
      calendarId: c.id,
      organizationId: ORG,
      title: "Draft",
      startAt: day(10),
      endAt: day(11),
      reminderMinutes: [15],
    });

    const updated = await updateCalendarEvent(event.id, {
      title: "Final",
      reminderMinutes: [5, 60],
    });
    expect(updated.title).toBe("Final");
    expect(updated.reminders.map((r) => r.minutesBefore).sort((a, b) => a - b)).toEqual([5, 60]);

    expect(await findCalendarEventById(event.id)).not.toBeNull();
    await softDeleteCalendarEvent(event.id);
    expect(await findCalendarEventById(event.id)).toBeNull();
  });

  it("searches by title/description, case-insensitively and scoped to calendars", async () => {
    const c = await cal();
    const other = await cal({ name: "Other" });
    await createCalendarEvent({
      calendarId: c.id,
      organizationId: ORG,
      title: "Quarterly Review",
      startAt: day(10),
      endAt: day(11),
    });
    await createCalendarEvent({
      calendarId: c.id,
      organizationId: ORG,
      title: "Lunch",
      description: "review the menu",
      startAt: day(12),
      endAt: day(13),
    });
    await createCalendarEvent({
      calendarId: other.id,
      organizationId: ORG,
      title: "Review elsewhere",
      startAt: day(14),
      endAt: day(15),
    });

    const hits = await searchCalendarEvents({
      organizationId: ORG,
      calendarIds: [c.id],
      query: "review",
    });
    expect(hits.map((e) => e.title).sort()).toEqual(["Lunch", "Quarterly Review"]);
  });
});

describe("findOverlappingEvents — conflict detection", () => {
  const day = (h: number) => new Date(`2026-05-11T${String(h).padStart(2, "0")}:00:00Z`);

  it("finds a same-calendar overlap and excludes non-overlapping events", async () => {
    const c = await cal();
    const existing = await createCalendarEvent({
      calendarId: c.id,
      organizationId: ORG,
      title: "Standup",
      startAt: day(9),
      endAt: day(10),
    });
    await createCalendarEvent({
      calendarId: c.id,
      organizationId: ORG,
      title: "Lunch",
      startAt: day(12),
      endAt: day(13),
    });

    const overlaps = await findOverlappingEvents({
      calendarId: c.id,
      organizationId: ORG,
      startAt: new Date("2026-05-11T09:30:00Z"),
      endAt: new Date("2026-05-11T10:30:00Z"),
    });
    expect(overlaps.map((e) => e.id)).toEqual([existing.id]);
  });

  it("excludes PUNCTUAL events on either side, and honors excludeEventId", async () => {
    const c = await cal();
    const punctual = await createCalendarEvent({
      calendarId: c.id,
      organizationId: ORG,
      title: "Ping",
      eventType: "PUNCTUAL",
      startAt: day(9),
      endAt: day(9),
    });
    const standard = await createCalendarEvent({
      calendarId: c.id,
      organizationId: ORG,
      title: "Standup",
      startAt: day(9),
      endAt: day(10),
    });

    const overlaps = await findOverlappingEvents({
      calendarId: c.id,
      organizationId: ORG,
      startAt: day(9),
      endAt: day(10),
    });
    expect(overlaps.map((e) => e.id)).toEqual([standard.id]);
    expect(overlaps.some((e) => e.id === punctual.id)).toBe(false);

    const excludingSelf = await findOverlappingEvents({
      calendarId: c.id,
      organizationId: ORG,
      startAt: day(9),
      endAt: day(10),
      excludeEventId: standard.id,
    });
    expect(excludingSelf).toHaveLength(0);
  });

  it("scopes to the given calendar only", async () => {
    const c = await cal();
    const other = await cal({ name: "Other" });
    await createCalendarEvent({
      calendarId: other.id,
      organizationId: ORG,
      title: "Elsewhere",
      startAt: day(9),
      endAt: day(10),
    });

    const overlaps = await findOverlappingEvents({
      calendarId: c.id,
      organizationId: ORG,
      startAt: day(9),
      endAt: day(10),
    });
    expect(overlaps).toHaveLength(0);
  });
});

describe("listEventsPaginated — agenda view", () => {
  const day = (n: number) => new Date(`2026-05-${String(10 + n).padStart(2, "0")}T09:00:00Z`);

  it("pages forward chronologically and reports nextCursor / total", async () => {
    const c = await cal();
    const events = [];
    for (let i = 0; i < 5; i++) {
      events.push(
        await createCalendarEvent({
          calendarId: c.id,
          organizationId: ORG,
          title: `Event ${i}`,
          startAt: day(i),
          endAt: new Date(day(i).getTime() + 60 * 60 * 1000),
        }),
      );
    }

    const page1 = await listEventsPaginated({
      organizationId: ORG,
      calendarIds: [c.id],
      from: day(0),
      limit: 2,
    });
    expect(page1.items.map((e) => e.id)).toEqual([events[0]!.id, events[1]!.id]);
    expect(page1.total).toBe(5);
    expect(page1.nextCursor).toBe(events[1]!.id);

    const page2 = await listEventsPaginated({
      organizationId: ORG,
      calendarIds: [c.id],
      from: day(0),
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items.map((e) => e.id)).toEqual([events[2]!.id, events[3]!.id]);
    expect(page2.nextCursor).toBe(events[3]!.id);

    const page3 = await listEventsPaginated({
      organizationId: ORG,
      calendarIds: [c.id],
      from: day(0),
      limit: 2,
      cursor: page2.nextCursor,
    });
    expect(page3.items.map((e) => e.id)).toEqual([events[4]!.id]);
    expect(page3.nextCursor).toBeNull();
  });

  it("excludes events that ended before `from`", async () => {
    const c = await cal();
    const past = await createCalendarEvent({
      calendarId: c.id,
      organizationId: ORG,
      title: "Past",
      startAt: day(-5),
      endAt: new Date(day(-5).getTime() + 60 * 60 * 1000),
    });
    const upcoming = await createCalendarEvent({
      calendarId: c.id,
      organizationId: ORG,
      title: "Upcoming",
      startAt: day(1),
      endAt: new Date(day(1).getTime() + 60 * 60 * 1000),
    });

    const page = await listEventsPaginated({
      organizationId: ORG,
      calendarIds: [c.id],
      from: day(0),
    });
    expect(page.items.map((e) => e.id)).toEqual([upcoming.id]);
    expect(page.items.some((e) => e.id === past.id)).toBe(false);
  });
});

describe("reminder delivery (cron)", () => {
  it("returns due reminders once and stops after markReminderNotified", async () => {
    const c = await cal();
    // startAt 30 min out, reminder 60 min before → scheduledFor is in the past.
    const event = await createCalendarEvent({
      calendarId: c.id,
      organizationId: ORG,
      title: "Soon",
      startAt: new Date(Date.now() + 30 * 60_000),
      endAt: new Date(Date.now() + 90 * 60_000),
      reminderMinutes: [60],
    });

    const pending = await getPendingReminders(new Date());
    const mine = pending.filter((r) => r.calendarEventId === event.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.calendarEvent.title).toBe("Soon");

    await markReminderNotified(mine[0]!.id);
    const after = await getPendingReminders(new Date());
    expect(after.filter((r) => r.calendarEventId === event.id)).toHaveLength(0);
  });

  it("does not surface reminders for a soft-deleted event", async () => {
    const c = await cal();
    const event = await createCalendarEvent({
      calendarId: c.id,
      organizationId: ORG,
      title: "Cancelled",
      startAt: new Date(Date.now() + 30 * 60_000),
      endAt: new Date(Date.now() + 90 * 60_000),
      reminderMinutes: [60],
    });
    await softDeleteCalendarEvent(event.id);
    const pending = await getPendingReminders(new Date());
    expect(pending.filter((r) => r.calendarEventId === event.id)).toHaveLength(0);
  });
});

describe("listCalendarMembers", () => {
  it("returns all active org members when the calendar has no role access", async () => {
    const c = await cal();
    const members = await listCalendarMembers({ organizationId: ORG, calendarId: c.id });
    expect(members.map((m) => m.id).sort()).toEqual([U1, U2].sort());
  });

  it("returns only users holding a granting role when access is restricted", async () => {
    const c = await cal();
    await setCalendarRoleAccess(c.id, [roleId]); // only U1 holds this role
    const members = await listCalendarMembers({ organizationId: ORG, calendarId: c.id });
    expect(members.map((m) => m.id)).toEqual([U1]);
  });
});
