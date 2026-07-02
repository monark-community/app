"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { CalendarDef, CalendarEvent, CalendarEventType } from "@monark/calendar/contracts";
import { trpc } from "@/lib/trpc";
import { CalendarManageDialog } from "./calendar-manage-dialog";
import { CalendarSidebar } from "./calendar-sidebar";
import { NewEventPopover, type NewEventSubmitPayload } from "./new-event-popover";

// ── Grid helpers ───────────────────────────────────────────────────────────────

function buildMonthGrid(year: number, month: number): Date[][] {
  // Sunday-first: getDay() returns 0 for Sun → offset 0, 1 for Mon → offset 1, etc.
  const offset = new Date(year, month, 1).getDay();
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(year, month, 1 - offset + w * 7 + d));
    }
    weeks.push(week);
  }
  return weeks;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

type RawEvent = {
  id: string;
  calendarId: string;
  title: string;
  startAt: string;
  endAt: string;
  eventType?: string | null;
  description?: string | null;
  location?: string | null;
  participants?: string[] | null;
  reminders?: { minutesBefore: number }[] | null;
};

type ParsedEvent = RawEvent & { _startAt: Date; _endAt: Date };

type SpanningEvent = {
  ev: ParsedEvent;
  startCol: number;
  endCol: number;
  lane: number;
  clippedStart: boolean;
  clippedEnd: boolean;
};

const LANE_H = 22;
const MAX_TIMED = 3;

// ── All-day spanning layout ────────────────────────────────────────────────────

function layoutAllDayEventsForWeek(
  week: Date[],
  allDayEvents: ParsedEvent[],
): { events: SpanningEvent[]; laneCount: number } {
  const msPerDay = 24 * 60 * 60 * 1000;
  const weekStartMs = new Date(week[0]!).setHours(0, 0, 0, 0);
  const weekEndMs = new Date(week[6]!).setHours(23, 59, 59, 999);

  const overlapping = allDayEvents.filter((ev) => {
    const evStartMs = new Date(ev._startAt).setHours(0, 0, 0, 0);
    const evEndMs = new Date(ev._endAt.getTime() - 1).setHours(0, 0, 0, 0);
    return evStartMs <= weekEndMs && evEndMs >= weekStartMs;
  });

  overlapping.sort((a, b) => a._startAt.getTime() - b._startAt.getTime());

  const laneBusy: boolean[][] = [];
  const result: SpanningEvent[] = [];

  for (const ev of overlapping) {
    const evStartMs = new Date(ev._startAt).setHours(0, 0, 0, 0);
    const evEndMs = new Date(ev._endAt.getTime() - 1).setHours(0, 0, 0, 0);

    const clippedStart = evStartMs < weekStartMs;
    const clippedEnd = evEndMs > weekEndMs;

    const displayStartMs = clippedStart ? weekStartMs : evStartMs;
    const displayEndMs = clippedEnd ? new Date(week[6]!).setHours(0, 0, 0, 0) : evEndMs;

    const startCol = Math.max(
      0,
      Math.min(6, Math.round((displayStartMs - weekStartMs) / msPerDay)),
    );
    const endCol = Math.max(0, Math.min(6, Math.round((displayEndMs - weekStartMs) / msPerDay)));

    let lane = 0;
    while (true) {
      if (!laneBusy[lane]) laneBusy[lane] = Array(7).fill(false);
      const conflict = laneBusy[lane]!.slice(startCol, endCol + 1).some(Boolean);
      if (!conflict) {
        for (let c = startCol; c <= endCol; c++) laneBusy[lane]![c] = true;
        break;
      }
      lane++;
    }

    result.push({ ev, startCol, endCol, lane, clippedStart, clippedEnd });
  }

  return { events: result, laneCount: laneBusy.length };
}

// ── Component ──────────────────────────────────────────────────────────────────

type MonthPopoverState =
  | { mode: "create"; anchorX: number; anchorY: number; date: Date; defaultCalendarId?: string }
  | { mode: "edit"; anchorX: number; anchorY: number; event: CalendarEvent }
  | null;

export function MonthView({
  selectedDate,
  onDayClick,
  initialCalendars,
  canManage,
  canDelete,
}: {
  selectedDate: Date;
  onDayClick: (date: Date) => void;
  initialCalendars: CalendarDef[];
  canManage?: boolean;
  canDelete?: boolean;
}) {
  const tw = useTranslations("calendar.weekView");
  const tm = useTranslations("calendar.monthView");

  // ── State ──────────────────────────────────────────────────────────────────
  const [hiddenCalendarIds, setHiddenCalendarIds] = useState(new Set<string>());
  const [manageState, setManageState] = useState<
    { open: true; calendar?: CalendarDef } | { open: false }
  >({ open: false });
  const [popoverState, setPopoverState] = useState<MonthPopoverState>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // ── Calendar list ──────────────────────────────────────────────────────────
  // See day-view: `initialCalendars` is trimmed to `CalendarDef`, so it can't seed
  // `initialData` ; the `?? initialCalendars` fallback covers the initial render.
  const calendarsQuery = trpc.calendar.calendars.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const calendars: CalendarDef[] = useMemo(
    () =>
      (calendarsQuery.data ?? initialCalendars)
        .map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description ?? undefined,
          color: c.color ?? undefined,
          isPersonal: "isPersonal" in c ? Boolean(c.isPersonal) : undefined,
        }))
        .sort((a, b) => {
          const aP = (a as { isPersonal?: boolean }).isPersonal;
          const bP = (b as { isPersonal?: boolean }).isPersonal;
          if (aP && !bP) return -1;
          if (!aP && bP) return 1;
          return a.name.localeCompare(b.name);
        }),
    [calendarsQuery.data, initialCalendars],
  );

  const calendarMap = useMemo(
    () => Object.fromEntries(calendars.map((c) => [c.id, c])),
    [calendars],
  );

  const toggleCalendar = useCallback((calendarId: string) => {
    setHiddenCalendarIds((prev) => {
      const next = new Set(prev);
      if (next.has(calendarId)) next.delete(calendarId);
      else next.add(calendarId);
      return next;
    });
  }, []);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createCalendar = trpc.calendar.calendars.create.useMutation({
    onSuccess: () => utils.calendar.calendars.list.invalidate(),
  });
  const updateCalendar = trpc.calendar.calendars.update.useMutation({
    onSuccess: () => utils.calendar.calendars.list.invalidate(),
  });
  const deleteCalendar = trpc.calendar.calendars.delete.useMutation({
    onSuccess: () => {
      void utils.calendar.calendars.list.invalidate();
      void utils.calendar.events.listForDay.invalidate();
    },
  });
  const createEvent = trpc.calendar.events.create.useMutation();
  const updateEvent = trpc.calendar.events.update.useMutation();
  const deleteEvent = trpc.calendar.events.delete.useMutation();

  const myRolesQuery = trpc.rbac.myRoles.useQuery(undefined, { refetchOnWindowFocus: false });
  const roles = useMemo(
    () => (myRolesQuery.data ?? []).map((r) => ({ id: r.id, name: r.name })),
    [myRolesQuery.data],
  );

  const handleCalendarSave = useCallback(
    async (data: { name: string; description?: string; color?: string; roleIds: string[] }) => {
      if (manageState.open && manageState.calendar) {
        await updateCalendar.mutateAsync({
          id: manageState.calendar.id,
          name: data.name,
          description: data.description,
          color: data.color,
          roleIds: data.roleIds,
        });
      } else {
        await createCalendar.mutateAsync({
          name: data.name,
          description: data.description,
          color: data.color,
          roleIds: data.roleIds,
        });
      }
      setManageState({ open: false });
    },
    [manageState, createCalendar, updateCalendar],
  );

  const handleCalendarDelete = useCallback(
    async (calendarId: string) => {
      setPopoverState(null);
      setSelectedEventId(null);
      await deleteCalendar.mutateAsync({ id: calendarId });
    },
    [deleteCalendar.mutateAsync],
  );

  const handleSidebarDelete = useCallback(
    async (calendarId: string) => {
      setPopoverState(null);
      setSelectedEventId(null);
      await deleteCalendar.mutateAsync({ id: calendarId });
    },
    [deleteCalendar.mutateAsync],
  );

  // ── Event popover handlers ─────────────────────────────────────────────────

  const closePopover = useCallback(() => {
    setPopoverState(null);
    setSelectedEventId(null);
  }, []);

  const handleMonthEventClick = useCallback((ev: ParsedEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    const calEvent: CalendarEvent = {
      id: ev.id,
      calendarId: ev.calendarId,
      title: ev.title,
      startAt: ev._startAt,
      endAt: ev._endAt,
      eventType: (ev.eventType as CalendarEventType) ?? undefined,
      description: ev.description ?? undefined,
      location: ev.location ?? undefined,
      participants: ev.participants ?? undefined,
      reminders: ev.reminders?.map((r) => r.minutesBefore) ?? undefined,
    };
    setPopoverState({ mode: "edit", event: calEvent, anchorX: e.clientX, anchorY: e.clientY });
    setSelectedEventId(ev.id);
  }, []);

  const handleDayCellClick = useCallback(
    (date: Date, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedEventId(null);
      setPopoverState({
        mode: "create",
        anchorX: e.clientX,
        anchorY: e.clientY,
        date,
        defaultCalendarId: calendars[0]?.id,
      });
    },
    [calendars],
  );

  // ── Grid ───────────────────────────────────────────────────────────────────
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const rangeStart = weeks[0]![0]!;
  const rangeEnd = useMemo(() => {
    const d = new Date(weeks[5]![6]!);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [weeks]);

  // ── Events ─────────────────────────────────────────────────────────────────
  const rangeQuery = useMemo(
    () => ({ startAt: rangeStart.toISOString(), endAt: rangeEnd.toISOString() }),
    [rangeStart, rangeEnd],
  );
  const eventsQuery = trpc.calendar.events.listForDay.useQuery(rangeQuery);

  const handleEventSubmit = useCallback(
    async (payload: NewEventSubmitPayload) => {
      await createEvent.mutateAsync({
        calendarId: payload.calendarId,
        eventType: payload.eventType,
        title: payload.title,
        description: payload.description,
        location: payload.location,
        participants: payload.participants,
        reminders: payload.reminders,
        startAt: payload.startAt.toISOString(),
        endAt: payload.endAt.toISOString(),
      });
      await utils.calendar.events.listForDay.fetch(rangeQuery);
      setPopoverState(null);
      setSelectedEventId(null);
    },
    [createEvent, utils, rangeQuery],
  );

  const handleEventUpdate = useCallback(
    async (eventId: string, patch: Partial<NewEventSubmitPayload>) => {
      await updateEvent.mutateAsync({
        id: eventId,
        calendarId: patch.calendarId,
        eventType: patch.eventType,
        title: patch.title,
        description: patch.description,
        location: patch.location,
        participants: patch.participants,
        reminders: patch.reminders,
        startAt: patch.startAt?.toISOString(),
        endAt: patch.endAt?.toISOString(),
      });
      await utils.calendar.events.listForDay.fetch(rangeQuery);
      setPopoverState(null);
      setSelectedEventId(null);
    },
    [updateEvent, utils, rangeQuery],
  );

  const handleEventDelete = useCallback(
    async (eventId: string) => {
      await deleteEvent.mutateAsync({ id: eventId });
      await utils.calendar.events.listForDay.fetch(rangeQuery);
      setPopoverState(null);
      setSelectedEventId(null);
    },
    [deleteEvent, utils, rangeQuery],
  );

  const todayRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  }, []);

  const todayEventsQuery = trpc.calendar.events.listForDay.useQuery(todayRange, {
    refetchOnWindowFocus: false,
  });

  const todayEvents = useMemo(() => {
    if (!todayEventsQuery.data) return [];
    return (todayEventsQuery.data as RawEvent[])
      .filter((ev) => !hiddenCalendarIds.has(ev.calendarId))
      .map((ev) => ({
        id: ev.id,
        calendarId: ev.calendarId,
        title: ev.title,
        startAt: new Date(ev.startAt),
        endAt: new Date(ev.endAt),
        eventType: ev.eventType,
      }))
      .sort((a, b) => {
        if (a.eventType === "ALL_DAY" && b.eventType !== "ALL_DAY") return -1;
        if (a.eventType !== "ALL_DAY" && b.eventType === "ALL_DAY") return 1;
        return a.startAt.getTime() - b.startAt.getTime();
      });
  }, [todayEventsQuery.data, hiddenCalendarIds]);

  const { allDayEvents, timedEventsByDay } = useMemo(() => {
    const allDay: ParsedEvent[] = [];
    const timed = new Map<string, ParsedEvent[]>();

    if (!eventsQuery.data) return { allDayEvents: allDay, timedEventsByDay: timed };

    for (const ev of eventsQuery.data as RawEvent[]) {
      if (hiddenCalendarIds.has(ev.calendarId)) continue;
      const _startAt = new Date(ev.startAt);
      const _endAt = new Date(ev.endAt);
      const parsed: ParsedEvent = { ...ev, _startAt, _endAt };

      if (ev.eventType === "ALL_DAY") {
        allDay.push(parsed);
      } else {
        const cursor = new Date(_startAt);
        cursor.setHours(0, 0, 0, 0);
        const last = new Date(_endAt.getTime() - 1);
        last.setHours(0, 0, 0, 0);
        while (cursor <= last) {
          const k = dayKey(cursor);
          if (!timed.has(k)) timed.set(k, []);
          timed.get(k)!.push(parsed);
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    }

    for (const [k, evs] of timed) {
      timed.set(
        k,
        evs.sort((a, b) => a._startAt.getTime() - b._startAt.getTime()),
      );
    }

    return { allDayEvents: allDay, timedEventsByDay: timed };
  }, [eventsQuery.data, hiddenCalendarIds]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const weekLayouts = useMemo(
    () => weeks.map((week) => layoutAllDayEventsForWeek(week, allDayEvents)),
    [weeks, allDayEvents],
  );

  const colHeaders = [tw("sun"), tw("mon"), tw("tue"), tw("wed"), tw("thu"), tw("fri"), tw("sat")];

  function isWeekendCol(col: number) {
    return col === 0 || col === 6;
  }

  return (
    <div className="flex h-full overflow-hidden">
      <CalendarSidebar
        selectedDate={selectedDate}
        onDateChange={onDayClick}
        calendars={calendars}
        hiddenCalendarIds={hiddenCalendarIds}
        onToggleCalendar={toggleCalendar}
        canManage={canManage ?? false}
        canDelete={canDelete}
        onAddCalendar={() => setManageState({ open: true, calendar: undefined })}
        onEditCalendar={(cal) => setManageState({ open: true, calendar: cal })}
        onDeleteCalendar={handleSidebarDelete}
        hideDatePicker
        todayEvents={todayEvents}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Column headers */}
        <div className="grid shrink-0 grid-cols-7 border-b border-border bg-background">
          {colHeaders.map((name, col) => (
            <div
              key={name}
              className={`py-2 text-center text-xs font-medium text-muted-foreground${isWeekendCol(col) ? " bg-muted/30" : ""}`}
            >
              {name}
            </div>
          ))}
        </div>

        {/* Six week rows */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {weeks.map((week, weekIdx) => {
            const { events: spanEvents, laneCount } = weekLayouts[weekIdx]!;

            return (
              <div
                key={weekIdx}
                className="flex min-h-0 flex-1 flex-col border-b border-border last:border-b-0"
              >
                {/* Day number row */}
                <div className="grid shrink-0 grid-cols-7 border-b border-border">
                  {week.map((day, col) => {
                    const inMonth = day.getMonth() === month;
                    const isToday = isSameDay(day, today);
                    const bg = isWeekendCol(col)
                      ? inMonth
                        ? "bg-muted/30"
                        : "bg-muted/40"
                      : inMonth
                        ? ""
                        : "bg-muted/20";
                    return (
                      <div
                        key={col}
                        className={`flex cursor-pointer items-start border-r border-border p-1 last:border-r-0 ${bg}`}
                        onClick={(e) => handleDayCellClick(day, e)}
                      >
                        <button
                          type="button"
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                            isToday
                              ? "bg-primary text-primary-foreground"
                              : inMonth
                                ? "text-foreground hover:bg-muted"
                                : "text-muted-foreground/60 hover:bg-muted"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDayClick(day);
                          }}
                        >
                          {day.getDate()}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* All-day spanning event lanes */}
                {laneCount > 0 && (
                  <div className="relative shrink-0" style={{ height: laneCount * LANE_H + 2 }}>
                    {/* Weekend column tint */}
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-7">
                      {week.map((day, col) => (
                        <div
                          key={col}
                          className={`border-r border-border last:border-r-0${isWeekendCol(col) ? (day.getMonth() === month ? " bg-muted/30" : " bg-muted/40") : day.getMonth() === month ? "" : " bg-muted/20"}`}
                        />
                      ))}
                    </div>

                    {spanEvents.map(({ ev, startCol, endCol, lane, clippedStart, clippedEnd }) => {
                      const cal = calendarMap[ev.calendarId];
                      const leftPct = (startCol / 7) * 100;
                      const widthPct = ((endCol - startCol + 1) / 7) * 100;
                      return (
                        <button
                          key={`${ev.id}-w${weekIdx}`}
                          type="button"
                          className={`absolute flex items-center overflow-hidden px-1.5 text-left text-xs font-medium hover:opacity-80${clippedStart ? " rounded-l-none" : " rounded-l-lg"}${clippedEnd ? " rounded-r-none" : " rounded-r-lg"}${ev.id === selectedEventId ? " ring-2 ring-primary ring-inset" : ""}`}
                          style={{
                            left: `calc(${leftPct}% + 2px)`,
                            width: `calc(${widthPct}% - 4px)`,
                            top: lane * LANE_H + 1,
                            height: LANE_H - 2,
                            backgroundColor: cal?.color
                              ? `${cal.color}4D`
                              : "hsl(var(--primary) / 0.3)",
                            borderLeft: clippedStart
                              ? "none"
                              : `3px solid ${cal?.color ?? "hsl(var(--primary))"}`,
                          }}
                          onClick={(e) => handleMonthEventClick(ev, e)}
                        >
                          <span className="truncate">{ev.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Timed events per cell */}
                <div className="grid min-h-0 flex-1 grid-cols-7">
                  {week.map((day, col) => {
                    const inMonth = day.getMonth() === month;
                    const k = dayKey(day);
                    const dayEvs = timedEventsByDay.get(k) ?? [];
                    const visible = dayEvs.slice(0, MAX_TIMED);
                    const overflow = dayEvs.length - MAX_TIMED;
                    const bg = isWeekendCol(col)
                      ? inMonth
                        ? "bg-muted/30"
                        : "bg-muted/40"
                      : inMonth
                        ? ""
                        : "bg-muted/20";

                    return (
                      <div
                        key={col}
                        className={`flex min-h-0 cursor-pointer flex-col gap-px overflow-hidden border-r border-border p-0.5 last:border-r-0 ${bg}`}
                        onClick={(e) => handleDayCellClick(day, e)}
                      >
                        {visible.map((ev) => {
                          const cal = calendarMap[ev.calendarId];
                          const isPunctual = ev.eventType === "PUNCTUAL";
                          const timeLabel = isPunctual
                            ? null
                            : `${String(ev._startAt.getHours()).padStart(2, "0")}:${String(ev._startAt.getMinutes()).padStart(2, "0")}`;

                          return (
                            <button
                              key={ev.id}
                              type="button"
                              className={`flex w-full min-w-0 items-baseline gap-0.5 truncate rounded px-1 py-px text-left text-xs font-medium hover:opacity-75${ev.id === selectedEventId ? " ring-2 ring-primary ring-inset" : ""}`}
                              style={
                                cal?.color
                                  ? {
                                      backgroundColor: `${cal.color}4D`,
                                      borderLeft: `2px solid ${cal.color}`,
                                    }
                                  : {
                                      borderLeft: "2px solid hsl(var(--primary))",
                                      backgroundColor: "hsl(var(--primary) / 0.3)",
                                    }
                              }
                              onClick={(e) => handleMonthEventClick(ev, e)}
                            >
                              {timeLabel && (
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  {timeLabel}
                                </span>
                              )}
                              <span className="truncate">{ev.title}</span>
                            </button>
                          );
                        })}
                        {overflow > 0 && (
                          <button
                            type="button"
                            className="px-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={() => onDayClick(day)}
                          >
                            +{overflow} {tm("more")}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {popoverState && (
        <NewEventPopover
          open
          anchorX={popoverState.anchorX}
          anchorY={popoverState.anchorY}
          side={window.innerWidth - popoverState.anchorX < 660 ? "left" : "right"}
          mode={popoverState.mode}
          selectedDate={
            popoverState.mode === "edit" ? popoverState.event.startAt : popoverState.date
          }
          existingEvent={popoverState.mode === "edit" ? popoverState.event : undefined}
          defaultCalendarId={
            popoverState.mode === "create" ? popoverState.defaultCalendarId : undefined
          }
          calendars={calendars}
          onCancel={closePopover}
          onDismiss={closePopover}
          onSubmit={handleEventSubmit}
          onUpdate={handleEventUpdate}
          onDelete={handleEventDelete}
        />
      )}

      <CalendarManageDialog
        open={manageState.open}
        calendar={manageState.open ? manageState.calendar : undefined}
        roles={roles}
        onClose={() => setManageState({ open: false })}
        onSave={handleCalendarSave}
        onDelete={handleCalendarDelete}
      />
    </div>
  );
}
