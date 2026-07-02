import { getDb, type Prisma } from "@monark/db";

export type CalendarRow = Prisma.CalendarGetPayload<{
  include: { roleAccess: true };
}>;

export type CalendarEventRow = Prisma.CalendarEventGetPayload<{
  include: { reminders: { select: { minutesBefore: true } } };
}>;

// ── Calendars ─────────────────────────────────────────────

export async function listAccessibleCalendars({
  organizationId,
  roleIds,
  hasManagedPermission,
  includeDeleted = false,
}: {
  organizationId: string;
  roleIds: string[];
  hasManagedPermission: boolean;
  includeDeleted?: boolean;
}): Promise<CalendarRow[]> {
  const db = getDb();
  return db.calendar.findMany({
    where: {
      organizationId,
      // Archived (soft-deleted) calendars are hidden unless explicitly
      // requested, so the sidebar can offer a "show archived" + restore path.
      ...(includeDeleted ? {} : { deletedAt: null }),
      // calendar.manage sees all; otherwise show calendars with no role
      // restrictions (personal/org-wide) OR where user's role has explicit access
      ...(hasManagedPermission
        ? {}
        : {
            OR: [
              { roleAccess: { none: {} } },
              ...(roleIds.length > 0
                ? [{ roleAccess: { some: { roleId: { in: roleIds } } } }]
                : []),
            ],
          }),
    },
    include: { roleAccess: true },
    orderBy: { name: "asc" },
  });
}

export async function findCalendarById(
  id: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
): Promise<CalendarRow | null> {
  return getDb().calendar.findFirst({
    where: { id, ...(includeDeleted ? {} : { deletedAt: null }) },
    include: { roleAccess: true },
  });
}

export async function createCalendar({
  organizationId,
  name,
  description,
  color,
  isPersonal = false,
}: {
  organizationId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  isPersonal?: boolean;
}): Promise<CalendarRow> {
  return getDb().calendar.create({
    data: { organizationId, name, description, color, isPersonal },
    include: { roleAccess: true },
  });
}

export async function updateCalendar(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    color?: string | null;
  },
): Promise<CalendarRow> {
  return getDb().calendar.update({
    where: { id },
    data: patch,
    include: { roleAccess: true },
  });
}

export async function softDeleteCalendar(id: string): Promise<void> {
  await getDb().calendar.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function restoreCalendar(id: string): Promise<void> {
  await getDb().calendar.update({
    where: { id },
    data: { deletedAt: null },
  });
}

export async function ensurePersonalCalendar({
  organizationId,
}: {
  organizationId: string;
}): Promise<CalendarRow> {
  const db = getDb();

  // Find existing personal calendar
  const existing = await db.calendar.findFirst({
    where: { organizationId, deletedAt: null, isPersonal: true },
    include: { roleAccess: true },
  });
  if (existing) return existing;

  // Backfill: if an org has an older calendar without the flag, mark it personal
  const oldest = await db.calendar.findFirst({
    where: { organizationId, deletedAt: null },
    include: { roleAccess: true },
    orderBy: { createdAt: "asc" },
  });
  if (oldest) {
    return db.calendar.update({
      where: { id: oldest.id },
      data: { isPersonal: true },
      include: { roleAccess: true },
    });
  }

  // Create with no roleAccess = visible to all org members
  return createCalendar({ organizationId, name: "Personal", color: "#6366f1", isPersonal: true });
}

export async function setCalendarRoleAccess(calendarId: string, roleIds: string[]): Promise<void> {
  const db = getDb();
  await db.$transaction([
    db.calendarRoleAccess.deleteMany({ where: { calendarId } }),
    db.calendarRoleAccess.createMany({
      data: roleIds.map((roleId) => ({ calendarId, roleId })),
      skipDuplicates: true,
    }),
  ]);
}

// ── Events ────────────────────────────────────────────────

export async function listEventsForDay({
  organizationId,
  calendarIds,
  startAt,
  endAt,
}: {
  organizationId: string;
  calendarIds: string[];
  startAt: Date;
  endAt: Date;
}): Promise<CalendarEventRow[]> {
  return getDb().calendarEvent.findMany({
    where: {
      organizationId,
      calendarId: { in: calendarIds },
      deletedAt: null,
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    include: { reminders: { select: { minutesBefore: true } } },
    orderBy: { startAt: "asc" },
  });
}

export async function createCalendarEvent({
  calendarId,
  organizationId,
  title,
  description,
  location,
  participants,
  startAt,
  endAt,
  eventType = "STANDARD",
  reminderMinutes,
}: {
  calendarId: string;
  organizationId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  participants?: string[];
  startAt: Date;
  endAt: Date;
  eventType?: "STANDARD" | "PUNCTUAL" | "ALL_DAY";
  reminderMinutes?: number[];
}): Promise<CalendarEventRow> {
  const db = getDb();
  const event = await db.calendarEvent.create({
    data: {
      calendarId,
      organizationId,
      title,
      description,
      location,
      participants: participants ?? [],
      startAt,
      endAt,
      eventType,
    },
  });
  if (reminderMinutes && reminderMinutes.length > 0) {
    await scheduleReminders(event.id, organizationId, startAt, reminderMinutes);
  }
  return db.calendarEvent.findUniqueOrThrow({
    where: { id: event.id },
    include: { reminders: { select: { minutesBefore: true } } },
  });
}

export async function updateCalendarEvent(
  id: string,
  patch: {
    calendarId?: string;
    title?: string;
    description?: string | null;
    location?: string | null;
    participants?: string[];
    startAt?: Date;
    endAt?: Date;
    eventType?: "STANDARD" | "PUNCTUAL" | "ALL_DAY";
    reminderMinutes?: number[];
  },
): Promise<CalendarEventRow> {
  const { reminderMinutes, ...data } = patch;
  const db = getDb();
  const event = await db.calendarEvent.update({
    where: { id },
    data,
    select: { organizationId: true, startAt: true },
  });
  if (reminderMinutes !== undefined) {
    await db.calendarEventReminder.deleteMany({ where: { calendarEventId: id } });
    if (reminderMinutes.length > 0) {
      await scheduleReminders(
        id,
        event.organizationId,
        patch.startAt ?? event.startAt,
        reminderMinutes,
      );
    }
  } else if (patch.startAt) {
    // Reschedule existing reminders when the event time changes
    const existing = await db.calendarEventReminder.findMany({
      where: { calendarEventId: id },
      select: { minutesBefore: true },
    });
    if (existing.length > 0) {
      await db.calendarEventReminder.deleteMany({ where: { calendarEventId: id } });
      await scheduleReminders(
        id,
        event.organizationId,
        patch.startAt,
        existing.map((r) => r.minutesBefore),
      );
    }
  }
  return db.calendarEvent.findUniqueOrThrow({
    where: { id },
    include: { reminders: { select: { minutesBefore: true } } },
  });
}

async function scheduleReminders(
  calendarEventId: string,
  organizationId: string,
  startAt: Date,
  minutesBeforeList: number[],
): Promise<void> {
  const db = getDb();
  await db.calendarEventReminder.createMany({
    data: minutesBeforeList.map((minutesBefore) => ({
      calendarEventId,
      organizationId,
      minutesBefore,
      scheduledFor: new Date(startAt.getTime() - minutesBefore * 60 * 1000),
    })),
    skipDuplicates: true,
  });
}

// Ownership lookup for authorization checks : returns the org + calendar an
// event belongs to (active events only) so the router can verify the caller
// may act on it before mutating. Returns null for missing / soft-deleted rows.
export async function findCalendarEventById(
  id: string,
): Promise<{ id: string; organizationId: string; calendarId: string } | null> {
  return getDb().calendarEvent.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, organizationId: true, calendarId: true },
  });
}

export async function softDeleteCalendarEvent(id: string): Promise<void> {
  await getDb().calendarEvent.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function searchCalendarEvents({
  organizationId,
  calendarIds,
  query,
}: {
  organizationId: string;
  calendarIds: string[];
  query: string;
}): Promise<CalendarEventRow[]> {
  return getDb().calendarEvent.findMany({
    where: {
      organizationId,
      calendarId: { in: calendarIds },
      deletedAt: null,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ],
    },
    include: { reminders: { select: { minutesBefore: true } } },
    orderBy: { startAt: "asc" },
    take: 25,
  });
}

// ── Reminder delivery (cron) ──────────────────────────────

export type PendingReminderRow = {
  id: string;
  minutesBefore: number;
  calendarEventId: string;
  organizationId: string;
  calendarEvent: {
    title: string;
    startAt: Date;
    calendarId: string;
  };
};

export async function getPendingReminders(now: Date): Promise<PendingReminderRow[]> {
  return getDb().calendarEventReminder.findMany({
    where: {
      scheduledFor: { lte: now },
      notifiedAt: null,
      calendarEvent: { deletedAt: null },
    },
    select: {
      id: true,
      minutesBefore: true,
      calendarEventId: true,
      organizationId: true,
      calendarEvent: {
        select: { title: true, startAt: true, calendarId: true },
      },
    },
    take: 100,
  }) as Promise<PendingReminderRow[]>;
}

export async function markReminderNotified(id: string): Promise<void> {
  await getDb().calendarEventReminder.update({
    where: { id },
    data: { notifiedAt: new Date() },
  });
}

export async function listCalendarMembers({
  organizationId,
  calendarId,
}: {
  organizationId: string;
  calendarId: string;
}): Promise<{ id: string; displayName: string | null; email: string; avatarUrl: string | null }[]> {
  const db = getDb();
  const calendarRoles = await db.calendarRoleAccess.findMany({
    where: { calendarId },
    select: { roleId: true },
  });
  const roleIds = calendarRoles.map((r) => r.roleId);

  if (roleIds.length === 0) {
    const memberships = await db.organizationMembership.findMany({
      where: { organizationId, leftAt: null },
      select: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true } } },
    });
    return memberships.map((m) => m.user);
  }

  return db.user.findMany({
    where: {
      memberships: { some: { organizationId, leftAt: null } },
      roleAssignments: { some: { organizationId, roleId: { in: roleIds }, revokedAt: null } },
    },
    select: { id: true, displayName: true, email: true, avatarUrl: true },
  });
}
