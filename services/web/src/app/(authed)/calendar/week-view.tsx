"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  CalendarDef,
  CalendarEvent,
  CalendarEventTime,
  CalendarEventType,
} from "@monark/calendar/contracts";
import {
  DaySchedule,
  DayTimeline,
  COLUMN_HEADER_HEIGHT,
  HOUR_HEIGHT_PX,
  TOTAL_HEIGHT_PX,
  useCurrentTime,
} from "@monark/calendar/client";
import { trpc } from "@/lib/trpc";
import { CalendarSidebar } from "./calendar-sidebar";
import { CalendarManageDialog } from "./calendar-manage-dialog";
import { NewEventPopover, type NewEventSubmitPayload } from "./new-event-popover";

// ── Helpers ────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // Sunday-first: subtract day-of-week (Sun=0)
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function localRangeIso(start: Date, end: Date) {
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(23, 59, 59, 999);
  return { startAt: s.toISOString(), endAt: e.toISOString() };
}

function isMultiDay(ev: CalendarEvent): boolean {
  if (ev.eventType === "ALL_DAY") return true;
  if (ev.eventType === "PUNCTUAL") return false;
  return !isSameDay(ev.startAt, ev.endAt);
}

function addOneHour(t: CalendarEventTime): CalendarEventTime {
  const total = Math.min(t.hour * 60 + t.minute + 60, 24 * 60 - 1);
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

// ── Multi-day layout ───────────────────────────────────────

type MultiDayPos = {
  event: CalendarEvent;
  startDayIdx: number;
  endDayIdx: number;
  row: number;
};

const MULTIDAY_ROW_H = 24;

// Local `Array.prototype.findLastIndex` (ES2023) — the project's tsconfig lib
// predates it, so use a typed helper rather than widen the lib globally.
function findLastIndex<T>(arr: T[], pred: (value: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i]!)) return i;
  }
  return -1;
}

function layoutMultiDayEvents(events: CalendarEvent[], days: Date[]): MultiDayPos[] {
  const positioned: MultiDayPos[] = [];
  const grid: boolean[][] = [];

  const sorted = [...events].sort((a, b) => {
    const aS = Math.max(
      0,
      days.findIndex((d) => isSameDay(d, a.startAt) || a.startAt <= d),
    );
    const bS = Math.max(
      0,
      days.findIndex((d) => isSameDay(d, b.startAt) || b.startAt <= d),
    );
    if (aS !== bS) return aS - bS;
    const aE = findLastIndex(days, (d) =>
      a.eventType === "ALL_DAY" ? isSameDay(d, a.startAt) : isSameDay(d, a.endAt) || a.endAt >= d,
    );
    const bE = findLastIndex(days, (d) =>
      b.eventType === "ALL_DAY" ? isSameDay(d, b.startAt) : isSameDay(d, b.endAt) || b.endAt >= d,
    );
    return bE - bS - (aE - aS);
  });

  for (const ev of sorted) {
    const startIdx = Math.max(
      0,
      days.findIndex((d) => isSameDay(d, ev.startAt) || ev.startAt <= d),
    );
    let endIdx: number;
    if (ev.eventType === "ALL_DAY") {
      const endDay = new Date(ev.endAt.getTime() - 1);
      endIdx = findLastIndex(days, (d) => isSameDay(d, endDay) || endDay >= d);
    } else {
      endIdx = findLastIndex(days, (d) => isSameDay(d, ev.endAt) || ev.endAt >= d);
    }
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) continue;

    let row = 0;
    outer: while (true) {
      if (!grid[row]) grid[row] = Array(7).fill(false);
      for (let d = startIdx; d <= endIdx; d++) {
        if (grid[row]![d]) {
          row++;
          continue outer;
        }
      }
      for (let d = startIdx; d <= endIdx; d++) grid[row]![d] = true;
      positioned.push({ event: ev, startDayIdx: startIdx, endDayIdx: endIdx, row });
      break;
    }
  }

  return positioned;
}

// ── Types ──────────────────────────────────────────────────

type PendingSlot = {
  dayIndex: number;
  startTime: CalendarEventTime;
  endTime: CalendarEventTime;
};

type DragState = {
  eventId: string;
  dayIndex: number;
  currentDayIndex: number;
  type: "move" | "resize";
  grabOffsetMin: number;
  initialStartMin: number;
  initialEndMin: number;
  durationMin: number;
  currentStartMin: number;
  currentEndMin: number;
  hasMoved: boolean;
};

type PendingEventEdit = {
  eventId: string;
  dayIndex: number;
  startAt: Date;
  endAt: Date;
};

type PopoverState =
  | {
      mode: "create";
      anchorX: number;
      anchorY: number;
      side: "left" | "right";
      startTime: CalendarEventTime;
      selectedDate: Date;
      defaultCalendarId?: string;
    }
  | {
      mode: "edit";
      anchorX: number;
      anchorY: number;
      side: "left" | "right";
      event: CalendarEvent;
      selectedDate: Date;
    }
  | null;

// ── WeekView ───────────────────────────────────────────────

export function WeekView({
  initialDate,
  weekStart: weekStartProp,
  onWeekChange,
  onDayClick,
  initialCalendars,
  canManage,
  canDelete,
}: {
  initialDate: Date;
  weekStart?: Date;
  onWeekChange?: (date: Date) => void;
  onDayClick?: (date: Date) => void;
  initialCalendars: CalendarDef[];
  canManage: boolean;
  canDelete?: boolean;
}) {
  const tEvent = useTranslations("calendar.dayView.newEvent");
  const tWeek = useTranslations("calendar.weekView");

  // ── Controlled/uncontrolled weekStart ──────────────────────
  const [weekStartState, setWeekStartState] = useState(() => getWeekStart(initialDate));
  const weekStart = weekStartProp ?? weekStartState;
  function handleWeekChange(date: Date) {
    const newStart = getWeekStart(date);
    if (onWeekChange) onWeekChange(newStart);
    else setWeekStartState(newStart);
  }

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekEnd = days[6]!;

  // ── State ──────────────────────────────────────────────────
  const [hiddenCalendarIds, setHiddenCalendarIds] = useState(new Set<string>());
  const [manageState, setManageState] = useState<
    { open: true; calendar?: CalendarDef } | { open: false }
  >({ open: false });
  const [popoverState, setPopoverState] = useState<PopoverState>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<PendingSlot | null>(null);
  const [pendingCalendarId, setPendingCalendarId] = useState<string | null>(null);
  const [pendingEventType, setPendingEventType] = useState<CalendarEventType>("STANDARD");
  const [pendingEventEdit, setPendingEventEdit] = useState<PendingEventEdit | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isPendingDragging, setIsPendingDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const pendingDragRef = useRef<{
    grabOffsetMin: number;
    durationMin: number;
    type: "move" | "resize";
  } | null>(null);
  const pendingSlotRef = useRef<PendingSlot | null>(null);
  const dragEndedRef = useRef(false);
  const lastDraggedEventIdRef = useRef<string | null>(null);
  dragStateRef.current = dragState;
  pendingSlotRef.current = pendingSlot;

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const toggleCalendar = useCallback((calendarId: string) => {
    setHiddenCalendarIds((prev) => {
      const next = new Set(prev);
      if (next.has(calendarId)) next.delete(calendarId);
      else next.add(calendarId);
      return next;
    });
  }, []);

  // ── Data ──────────────────────────────────────────────────
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
          if (a.isPersonal && !b.isPersonal) return -1;
          if (!a.isPersonal && b.isPersonal) return 1;
          return a.name.localeCompare(b.name);
        }),
    [calendarsQuery.data, initialCalendars],
  );

  const visibleCalendars = useMemo(
    () => calendars.filter((c) => !hiddenCalendarIds.has(c.id)),
    [calendars, hiddenCalendarIds],
  );
  const colorMap = useMemo(
    () => Object.fromEntries(visibleCalendars.map((c) => [c.id, c.color])),
    [visibleCalendars],
  );

  const rangeQuery = useMemo(() => localRangeIso(weekStart, weekEnd), [weekStart, weekEnd]);
  const eventsQuery = trpc.calendar.events.listForDay.useQuery(rangeQuery, {
    refetchOnWindowFocus: false,
  });

  // ── Event classification + layout ──────────────────────────
  const { multiDayPositions, dayEventsMap } = useMemo(() => {
    const raw = eventsQuery.data ?? [];
    const multi: CalendarEvent[] = [];
    const perDay: CalendarEvent[][] = days.map(() => []);

    for (const ev of raw) {
      if (!visibleCalendars.some((c) => c.id === ev.calendarId)) continue;
      const converted: CalendarEvent = {
        ...ev,
        startAt: new Date(ev.startAt),
        endAt: new Date(ev.endAt),
        description: ev.description ?? undefined,
        location: ev.location ?? undefined,
        participants: ev.participants ?? undefined,
        reminders: ev.reminders?.map((r) => r.minutesBefore) ?? undefined,
        color: colorMap[ev.calendarId],
      };

      // Dragged event: skip normal placement; insert at the target column with live times
      if (dragState && dragState.eventId === converted.id) {
        const targetDay = days[dragState.currentDayIndex]!;
        const startAt = new Date(targetDay);
        startAt.setHours(
          Math.floor(dragState.currentStartMin / 60),
          dragState.currentStartMin % 60,
          0,
          0,
        );
        const endAt = new Date(targetDay);
        endAt.setHours(
          Math.floor(dragState.currentEndMin / 60),
          dragState.currentEndMin % 60,
          0,
          0,
        );
        perDay[dragState.currentDayIndex]!.push({ ...converted, startAt, endAt });
        continue;
      }

      // PendingEventEdit: skip normal placement; insert at (possibly new) day with form-driven times
      if (
        !dragState &&
        pendingEventEdit &&
        pendingEventEdit.eventId === converted.id &&
        !isMultiDay(converted)
      ) {
        perDay[pendingEventEdit.dayIndex]!.push({
          ...converted,
          startAt: pendingEventEdit.startAt,
          endAt: pendingEventEdit.endAt,
        });
        continue;
      }

      if (isMultiDay(converted)) {
        multi.push(converted);
      } else {
        const idx = days.findIndex((d) => isSameDay(d, converted.startAt));
        if (idx !== -1) perDay[idx]!.push(converted);
      }
    }

    // Inject pending creation ghost
    if (pendingSlot && pendingEventType !== "ALL_DAY") {
      const day = days[pendingSlot.dayIndex];
      if (day) {
        const startAt = new Date(day);
        startAt.setHours(pendingSlot.startTime.hour, pendingSlot.startTime.minute, 0, 0);
        const endAt =
          pendingEventType === "PUNCTUAL"
            ? new Date(startAt)
            : (() => {
                const d = new Date(day);
                d.setHours(pendingSlot.endTime.hour, pendingSlot.endTime.minute, 0, 0);
                return d;
              })();
        const pendingCal = pendingCalendarId ?? visibleCalendars[0]?.id ?? "";
        perDay[pendingSlot.dayIndex]!.push({
          id: "__pending__",
          calendarId: pendingCal,
          color: colorMap[pendingCal] ?? undefined,
          startAt,
          endAt,
          title: tEvent("heading"),
          eventType: pendingEventType,
        });
      }
    }

    return {
      multiDayPositions: layoutMultiDayEvents(multi, days),
      dayEventsMap: perDay,
    };
  }, [
    eventsQuery.data,
    days,
    visibleCalendars,
    colorMap,
    pendingSlot,
    pendingCalendarId,
    pendingEventType,
    tEvent,
    dragState,
    pendingEventEdit,
  ]);

  const pendingEditEventId = dragState?.eventId ?? pendingEventEdit?.eventId ?? null;

  const multiDayRows =
    multiDayPositions.length > 0
      ? multiDayPositions.reduce((m, p) => Math.max(m, p.row), 0) + 1
      : 0;

  // ── Mutations ──────────────────────────────────────────────
  const createCalendarMutation = trpc.calendar.calendars.create.useMutation({
    onSuccess: () => utils.calendar.calendars.list.invalidate(),
  });
  const updateCalendarMutation = trpc.calendar.calendars.update.useMutation({
    onSuccess: () => utils.calendar.calendars.list.invalidate(),
  });
  const deleteCalendarMutation = trpc.calendar.calendars.delete.useMutation({
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

  // ── Handlers ──────────────────────────────────────────────
  const clearPopover = useCallback(() => {
    setPopoverState(null);
    setSelectedEventId(null);
    setPendingSlot(null);
    setPendingCalendarId(null);
    setPendingEventEdit(null);
    setPendingEventType("STANDARD");
  }, []);

  // Closes the popover UI without discarding the pending edit/slot state.
  // Used for click-outside so the event block stays at its previewed position.
  const dismissPopover = useCallback(() => {
    setPopoverState(null);
  }, []);

  const handleSlotClick = useCallback(
    (
      dayIndex: number,
      time: CalendarEventTime,
      anchorX: number,
      anchorY: number,
      side: "left" | "right",
    ) => {
      if (dragEndedRef.current) {
        dragEndedRef.current = false;
        lastDraggedEventIdRef.current = null;
        return;
      }
      const endTime = addOneHour(time);
      setSelectedEventId(null);
      setPendingEventType("STANDARD");
      setPendingEventEdit(null);
      setPendingSlot({ dayIndex, startTime: time, endTime });
      setPendingCalendarId(visibleCalendars[0]?.id ?? null);
      setPopoverState({
        mode: "create",
        anchorX,
        anchorY,
        side,
        startTime: time,
        selectedDate: days[dayIndex]!,
        defaultCalendarId: visibleCalendars[0]?.id,
      });
    },
    [days, visibleCalendars],
  );

  const handleEventClick = useCallback(
    (event: CalendarEvent, anchorX: number, anchorY: number, side: "left" | "right" = "right") => {
      if (dragEndedRef.current) {
        const wasDraggedEvent = event.id === lastDraggedEventIdRef.current;
        dragEndedRef.current = false;
        lastDraggedEventIdRef.current = null;
        if (wasDraggedEvent) return;
      }
      // Clicking the pending creation block re-opens the create form at the same slot
      if (event.id === "__pending__") {
        const ps = pendingSlotRef.current;
        if (ps) {
          setPopoverState({
            mode: "create",
            anchorX,
            anchorY,
            side,
            startTime: ps.startTime,
            selectedDate: days[ps.dayIndex]!,
            defaultCalendarId: visibleCalendars[0]?.id,
          });
        }
        return;
      }
      const eventDayIdx = days.findIndex((d) => isSameDay(d, event.startAt));
      const eventDay = days[eventDayIdx] ?? days[0]!;
      setSelectedEventId(event.id);
      setPendingSlot(null);
      if (!isMultiDay(event)) {
        setPendingEventEdit({
          eventId: event.id,
          dayIndex: eventDayIdx >= 0 ? eventDayIdx : 0,
          startAt: event.startAt,
          endAt: event.endAt,
        });
      }
      setPopoverState({ mode: "edit", anchorX, anchorY, side, event, selectedDate: eventDay });
    },
    [days, visibleCalendars],
  );

  const handleTimeChange = useCallback(
    (startTime: CalendarEventTime, endTime: CalendarEventTime) => {
      setPendingSlot((prev) => (prev ? { ...prev, startTime, endTime } : null));
      setPendingEventEdit((prev) => {
        if (!prev) return null;
        const base = new Date(prev.startAt);
        base.setHours(0, 0, 0, 0);
        const newStart = new Date(base);
        newStart.setHours(startTime.hour, startTime.minute, 0, 0);
        const newEnd = new Date(base);
        newEnd.setHours(endTime.hour, endTime.minute, 0, 0);
        return { ...prev, startAt: newStart, endAt: newEnd };
      });
    },
    [],
  );

  const handleDateChange = useCallback(
    (date: Date) => {
      const newDayIdx = days.findIndex((d) => isSameDay(d, date));
      setPendingEventEdit((prev) => {
        if (!prev) return null;
        const newStart = new Date(date);
        newStart.setHours(prev.startAt.getHours(), prev.startAt.getMinutes(), 0, 0);
        const newEnd = new Date(date);
        newEnd.setHours(prev.endAt.getHours(), prev.endAt.getMinutes(), 0, 0);
        return {
          ...prev,
          dayIndex: newDayIdx >= 0 ? newDayIdx : prev.dayIndex,
          startAt: newStart,
          endAt: newEnd,
        };
      });
    },
    [days],
  );

  const handleCalendarChange = useCallback((calendarId: string) => {
    setPendingCalendarId(calendarId);
  }, []);

  const handleDragStart = useCallback(
    (params: {
      event: CalendarEvent;
      dayIndex: number;
      type: "move" | "resize";
      clientY: number;
    }) => {
      const { event, dayIndex, type, clientY } = params;

      // Pending creation block drag: update the slot time without clearing it
      if (event.id === "__pending__") {
        if (!scrollRef.current || !pendingSlotRef.current) return;
        const ps = pendingSlotRef.current;
        const rect = scrollRef.current.getBoundingClientRect();
        const scrollTop = scrollRef.current.scrollTop;
        const headerH = stickyHeaderRef.current?.offsetHeight ?? COLUMN_HEADER_HEIGHT;
        const yInSchedule = clientY - rect.top - headerH + scrollTop;
        const cursorMin = (yInSchedule / TOTAL_HEIGHT_PX) * (24 * 60);
        const startMin = ps.startTime.hour * 60 + ps.startTime.minute;
        const endMin = ps.endTime.hour * 60 + ps.endTime.minute;
        const durationMin = Math.max(endMin - startMin, 15);
        pendingDragRef.current =
          type === "resize"
            ? { grabOffsetMin: cursorMin - endMin, durationMin, type: "resize" }
            : { grabOffsetMin: cursorMin - startMin, durationMin, type: "move" };
        dismissPopover();
        setIsPendingDragging(true);
        return;
      }

      if (!scrollRef.current) return;
      const startMin = event.startAt.getHours() * 60 + event.startAt.getMinutes();
      const endMin = event.endAt.getHours() * 60 + event.endAt.getMinutes();
      const isPunctual =
        event.eventType === "PUNCTUAL" || event.startAt.getTime() === event.endAt.getTime();
      const durationMin = isPunctual ? 0 : Math.max(endMin - startMin, 15);
      const rect = scrollRef.current.getBoundingClientRect();
      const scrollTop = scrollRef.current.scrollTop;
      const headerH = stickyHeaderRef.current?.offsetHeight ?? COLUMN_HEADER_HEIGHT;
      const yInSchedule = clientY - rect.top - headerH + scrollTop;
      const cursorMin = (yInSchedule / TOTAL_HEIGHT_PX) * (24 * 60);
      clearPopover();
      setDragState({
        eventId: event.id,
        dayIndex,
        currentDayIndex: dayIndex,
        type,
        grabOffsetMin: type === "move" ? cursorMin - startMin : cursorMin - endMin,
        initialStartMin: startMin,
        initialEndMin: endMin,
        durationMin,
        currentStartMin: startMin,
        currentEndMin: endMin,
        hasMoved: false,
      });
    },
    [clearPopover, dismissPopover],
  );

  // ── Pending creation drag ─────────────────────────────────
  useLayoutEffect(() => {
    if (!isPendingDragging) return;

    function onPointerMove(e: PointerEvent) {
      const pd = pendingDragRef.current;
      if (!pd || !scrollRef.current) return;
      const rect = scrollRef.current.getBoundingClientRect();
      const scrollTop = scrollRef.current.scrollTop;
      const headerH = stickyHeaderRef.current?.offsetHeight ?? COLUMN_HEADER_HEIGHT;
      const yInSchedule = e.clientY - rect.top - headerH + scrollTop;
      const cursorMin = (yInSchedule / TOTAL_HEIGHT_PX) * (24 * 60);
      if (pd.type === "resize") {
        const ps = pendingSlotRef.current;
        const startMin = ps ? ps.startTime.hour * 60 + ps.startTime.minute : 0;
        const newEnd = Math.max(
          startMin + 15,
          Math.min(Math.round((cursorMin - pd.grabOffsetMin) / 15) * 15, 24 * 60),
        );
        setPendingSlot((prev) =>
          prev
            ? { ...prev, endTime: { hour: Math.floor(newEnd / 60), minute: newEnd % 60 } }
            : null,
        );
      } else {
        const rawStart = cursorMin - pd.grabOffsetMin;
        const newStart = Math.max(
          0,
          Math.min(Math.round(rawStart / 15) * 15, 24 * 60 - pd.durationMin),
        );
        const newEnd = newStart + pd.durationMin;
        setPendingSlot((prev) =>
          prev
            ? {
                ...prev,
                startTime: { hour: Math.floor(newStart / 60), minute: newStart % 60 },
                endTime: { hour: Math.floor(newEnd / 60), minute: newEnd % 60 },
              }
            : null,
        );
      }
    }

    function onPointerUp(e: PointerEvent) {
      pendingDragRef.current = null;
      setIsPendingDragging(false);
      const ps = pendingSlotRef.current;
      if (!ps) return;
      setPopoverState({
        mode: "create",
        anchorX: e.clientX,
        anchorY: e.clientY,
        side: window.innerWidth - e.clientX < 660 ? "left" : "right",
        startTime: ps.startTime,
        selectedDate: days[ps.dayIndex]!,
        defaultCalendarId: visibleCalendars[0]?.id,
      });
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [isPendingDragging]);

  useEffect(() => {
    if (!isPendingDragging) return;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isPendingDragging]);

  // ── Drag mouse listeners ───────────────────────────────────
  useLayoutEffect(() => {
    if (!dragState) return;

    const TIMELINE_W = 64; // w-16

    function onPointerMove(e: PointerEvent) {
      const ds = dragStateRef.current;
      if (!ds || !scrollRef.current) return;
      const rect = scrollRef.current.getBoundingClientRect();
      const scrollTop = scrollRef.current.scrollTop;
      const headerH = stickyHeaderRef.current?.offsetHeight ?? COLUMN_HEADER_HEIGHT;
      const yInSchedule = e.clientY - rect.top - headerH + scrollTop;
      const cursorMin = (yInSchedule / TOTAL_HEIGHT_PX) * (24 * 60);

      const colAreaWidth = rect.width - TIMELINE_W;
      const colWidth = colAreaWidth / 7;
      const relX = e.clientX - rect.left - TIMELINE_W;
      const newDayIndex = Math.max(0, Math.min(6, Math.floor(relX / colWidth)));

      setDragState((prev) => {
        if (!prev) return null;
        if (prev.type === "move") {
          const rawStart = cursorMin - prev.grabOffsetMin;
          const newStart = Math.max(
            0,
            Math.min(Math.round(rawStart / 15) * 15, 24 * 60 - prev.durationMin),
          );
          const moved =
            newDayIndex !== prev.currentDayIndex || Math.abs(newStart - prev.initialStartMin) >= 5;
          return {
            ...prev,
            currentDayIndex: newDayIndex,
            currentStartMin: newStart,
            currentEndMin: newStart + prev.durationMin,
            hasMoved: prev.hasMoved || moved,
          };
        }
        const newEnd = Math.max(
          prev.currentStartMin + 15,
          Math.min(Math.round((cursorMin - prev.grabOffsetMin) / 15) * 15, 24 * 60),
        );
        const moved = Math.abs(newEnd - prev.initialEndMin) >= 5;
        return { ...prev, currentEndMin: newEnd, hasMoved: prev.hasMoved || moved };
      });
    }

    function onPointerUp(e: PointerEvent) {
      const ds = dragStateRef.current;
      if (!ds) return;
      setDragState(null);

      if (!ds.hasMoved) return;

      dragEndedRef.current = true;
      lastDraggedEventIdRef.current = ds.eventId;
      setTimeout(() => {
        dragEndedRef.current = false;
        lastDraggedEventIdRef.current = null;
      }, 0);

      const targetDayIndex = ds.currentDayIndex;
      const day = days[targetDayIndex]!;
      const startAt = new Date(day);
      startAt.setHours(Math.floor(ds.currentStartMin / 60), ds.currentStartMin % 60, 0, 0);
      const endAt = new Date(day);
      endAt.setHours(Math.floor(ds.currentEndMin / 60), ds.currentEndMin % 60, 0, 0);

      const rawEvent = (eventsQuery.data ?? []).find((ev) => ev.id === ds.eventId);
      if (!rawEvent) return;

      const updatedEvent: CalendarEvent = {
        id: rawEvent.id,
        calendarId: rawEvent.calendarId,
        title: rawEvent.title,
        startAt,
        endAt,
        description: rawEvent.description ?? undefined,
        location: rawEvent.location ?? undefined,
        participants: rawEvent.participants ?? undefined,
      };

      setPendingEventEdit({ eventId: ds.eventId, dayIndex: targetDayIndex, startAt, endAt });
      setSelectedEventId(ds.eventId);
      setPopoverState({
        mode: "edit",
        anchorX: e.clientX,
        anchorY: e.clientY,
        side: window.innerWidth - e.clientX < 660 ? "left" : "right",
        event: updatedEvent,
        selectedDate: day,
      });
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [!!dragState]);

  useEffect(() => {
    if (!dragState) return;
    const cursor = dragState.type === "move" ? "grabbing" : "s-resize";
    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [!!dragState, dragState?.type]);

  // ── Submit handlers ────────────────────────────────────────
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
      await utils.calendar.events.listForDay.invalidate(rangeQuery);
      clearPopover();
    },
    [createEvent, utils, rangeQuery, clearPopover],
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
      await utils.calendar.events.listForDay.invalidate(rangeQuery);
      clearPopover();
    },
    [updateEvent, utils, rangeQuery, clearPopover],
  );

  const handleEventDelete = useCallback(
    async (eventId: string) => {
      await deleteEvent.mutateAsync({ id: eventId });
      await utils.calendar.events.listForDay.invalidate(rangeQuery);
      clearPopover();
    },
    [deleteEvent, utils, rangeQuery, clearPopover],
  );

  const handleCalendarSave = useCallback(
    async (data: { name: string; description?: string; color?: string; roleIds: string[] }) => {
      if (manageState.open && manageState.calendar) {
        await updateCalendarMutation.mutateAsync({
          id: manageState.calendar.id,
          name: data.name,
          description: data.description,
          color: data.color,
          roleIds: data.roleIds,
        });
      } else {
        await createCalendarMutation.mutateAsync({
          name: data.name,
          description: data.description,
          color: data.color,
          roleIds: data.roleIds,
        });
      }
      setManageState({ open: false });
    },
    [manageState, createCalendarMutation, updateCalendarMutation],
  );

  const handleCalendarDelete = useCallback(
    async (calendarId: string) => {
      clearPopover();
      await deleteCalendarMutation.mutateAsync({ id: calendarId });
    },
    [deleteCalendarMutation.mutateAsync, clearPopover],
  );

  const handleSidebarDelete = useCallback(
    async (calendarId: string) => {
      clearPopover();
      await deleteCalendarMutation.mutateAsync({ id: calendarId });
    },
    [deleteCalendarMutation.mutateAsync, clearPopover],
  );

  // ── Current time indicator ────────────────────────────────
  const today = new Date();
  const { totalMinutes } = useCurrentTime();
  const timeIndicatorTop = (totalMinutes / (24 * 60)) * TOTAL_HEIGHT_PX;

  const DAY_NAMES = [
    tWeek("sun"),
    tWeek("mon"),
    tWeek("tue"),
    tWeek("wed"),
    tWeek("thu"),
    tWeek("fri"),
    tWeek("sat"),
  ];

  return (
    <div className="flex h-full overflow-hidden">
      <CalendarSidebar
        selectedDate={weekStart}
        weekRange={{ from: weekStart, to: weekEnd }}
        onDateChange={handleWeekChange}
        calendars={calendars}
        hiddenCalendarIds={hiddenCalendarIds}
        onToggleCalendar={toggleCalendar}
        canManage={canManage}
        canDelete={canDelete}
        onAddCalendar={() => setManageState({ open: true, calendar: undefined })}
        onEditCalendar={(cal) => setManageState({ open: true, calendar: cal })}
        onDeleteCalendar={handleSidebarDelete}
      />

      <div
        ref={scrollRef}
        className="relative flex-1"
        style={{ overflowY: popoverState || isPendingDragging ? "hidden" : "auto" }}
      >
        {/* Sticky header — z-40 keeps it above event blocks (max z-30) */}
        <div
          ref={stickyHeaderRef}
          className="sticky top-0 z-40 flex flex-col border-b border-border bg-background shadow-sm"
        >
          <div className="flex">
            <div
              className="w-16 shrink-0 border-r border-border"
              style={{ height: COLUMN_HEADER_HEIGHT }}
            />
            {days.map((day, i) => {
              const isToday = isSameDay(day, today);
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <div
                  key={i}
                  className={`flex min-w-30 flex-1 flex-col items-center justify-center border-r border-border py-2 last:border-r-0${isWeekend ? " bg-muted/30" : ""}`}
                  style={{ height: COLUMN_HEADER_HEIGHT }}
                >
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {DAY_NAMES[i]}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDayClick?.(day)}
                    className={`mt-0.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                      isToday
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {day.getDate()}
                  </button>
                </div>
              );
            })}
          </div>

          {multiDayRows > 0 && (
            <div className="flex border-t border-border">
              <div className="w-16 shrink-0 border-r border-border" />
              <div
                className="relative flex-1"
                style={{ height: multiDayRows * MULTIDAY_ROW_H + 4 }}
              >
                {multiDayPositions.map(({ event, startDayIdx, endDayIdx, row }) => {
                  const ec = event.color;
                  const widthPct = ((endDayIdx - startDayIdx + 1) / 7) * 100;
                  const leftPct = (startDayIdx / 7) * 100;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className={`absolute truncate rounded-sm border-l-2 px-1.5 text-left text-xs font-medium leading-5 ${selectedEventId === event.id ? "ring-2 ring-primary" : ""} ${!ec ? "border-primary bg-primary/15 text-foreground" : "text-foreground"}`}
                      style={{
                        top: row * MULTIDAY_ROW_H + 2,
                        height: MULTIDAY_ROW_H - 2,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        borderLeftColor: ec,
                        backgroundColor: ec ? `${ec}4D` : undefined,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const anchorY =
                          stickyHeaderRef.current?.getBoundingClientRect().bottom ?? rect.bottom;
                        const side: "left" | "right" =
                          window.innerWidth - rect.right < 660 ? "left" : "right";
                        handleEventClick(
                          event,
                          side === "left" ? rect.left : rect.right,
                          anchorY,
                          side,
                        );
                      }}
                    >
                      {event.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Hour grid + day columns */}
        <div className="flex" style={{ height: TOTAL_HEIGHT_PX }}>
          <DayTimeline date={weekStart} hideHeader />
          {days.map((day, i) => {
            const events = dayEventsMap[i] ?? [];
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            return (
              <div
                key={i}
                className={`relative flex min-w-30 flex-1 flex-col border-r border-border last:border-r-0${isWeekend ? " bg-muted/30" : ""}`}
                style={{ height: TOTAL_HEIGHT_PX }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    className="pointer-events-none absolute left-0 right-0 border-t border-border"
                    style={{ top: h * HOUR_HEIGHT_PX }}
                    aria-hidden
                  />
                ))}
                {isSameDay(day, today) && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                    style={{ top: timeIndicatorTop }}
                    aria-hidden
                  >
                    <div
                      className="shrink-0"
                      style={{
                        width: 0,
                        height: 0,
                        borderTop: "5px solid transparent",
                        borderBottom: "5px solid transparent",
                        borderLeft: "10px solid hsl(var(--primary))",
                      }}
                    />
                    <div className="h-px flex-1 bg-primary" />
                  </div>
                )}
                <DaySchedule
                  columnId={`week-day-${i}`}
                  events={events}
                  selectedEventId={selectedEventId}
                  pendingEditEventId={pendingEditEventId}
                  onSlotClick={(_colId, time, anchorX, anchorY, side) =>
                    handleSlotClick(i, time, anchorX, anchorY, side)
                  }
                  onEventClick={(event, anchorX, anchorY, side) =>
                    handleEventClick(event, anchorX, anchorY, side)
                  }
                  onDragStart={(event, _colId, type, clientY) =>
                    handleDragStart({ event, dayIndex: i, type, clientY })
                  }
                />
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
          side={popoverState.side}
          mode={popoverState.mode}
          startTime={popoverState.mode === "create" ? popoverState.startTime : undefined}
          selectedDate={popoverState.selectedDate}
          existingEvent={popoverState.mode === "edit" ? popoverState.event : undefined}
          calendars={calendars}
          defaultCalendarId={
            popoverState.mode === "create" ? popoverState.defaultCalendarId : undefined
          }
          onDismiss={popoverState.mode === "create" ? clearPopover : dismissPopover}
          onCancel={clearPopover}
          onSubmit={handleEventSubmit}
          onUpdate={handleEventUpdate}
          onDelete={handleEventDelete}
          onTimeChange={handleTimeChange}
          onDateChange={handleDateChange}
          onTypeChange={setPendingEventType}
          onCalendarChange={handleCalendarChange}
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
