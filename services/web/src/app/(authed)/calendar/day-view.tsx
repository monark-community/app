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
  CurrentTimeIndicator,
  DaySchedule,
  DayTimeline,
  HOUR_HEIGHT_PX,
  TOTAL_HEIGHT_PX,
} from "@monark/calendar/client";
import { trpc } from "@/lib/trpc";
import { CalendarSidebar } from "./calendar-sidebar";
import { CalendarManageDialog } from "./calendar-manage-dialog";
import { NewEventPopover, type NewEventSubmitPayload } from "./new-event-popover";

type PopoverState =
  | {
      mode: "create";
      anchorX: number;
      anchorY: number;
      side: "left" | "right";
      startTime: CalendarEventTime;
      defaultCalendarId?: string;
    }
  | { mode: "edit"; anchorX: number; anchorY: number; side: "left" | "right"; event: CalendarEvent }
  | null;

type PendingSlot = {
  columnId: string;
  startTime: CalendarEventTime;
  endTime: CalendarEventTime;
};

type DragState = {
  eventId: string;
  columnId: string;
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
  columnId: string;
  startAt: Date;
  endAt: Date;
};

function localDayRange(date: Date): { startAt: string; endAt: string } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

function addOneHour(t: CalendarEventTime): CalendarEventTime {
  const total = Math.min(t.hour * 60 + t.minute + 60, 24 * 60 - 1);
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export function DayView({
  initialDate,
  selectedDate: selectedDateProp,
  onDateChange: onDateChangeProp,
  initialCalendars,
  canManage,
  canDelete,
  focusEventId,
  onEventFocused,
  pendingCreateDefaults,
  onPendingCreateConsumed,
}: {
  initialDate: Date;
  selectedDate?: Date;
  onDateChange?: (date: Date) => void;
  initialCalendars: CalendarDef[];
  canManage: boolean;
  canDelete?: boolean;
  focusEventId?: string | null;
  onEventFocused?: () => void;
  pendingCreateDefaults?: {
    calendarId: string;
    startAt: Date;
    endAt: Date;
    eventType?: CalendarEventType;
  } | null;
  onPendingCreateConsumed?: () => void;
}) {
  const [selectedDateState, setSelectedDateState] = useState<Date>(initialDate);
  const selectedDate = selectedDateProp ?? selectedDateState;
  const setSelectedDate = onDateChangeProp ?? setSelectedDateState;
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [popoverState, setPopoverState] = useState<PopoverState>(null);
  const [hiddenCalendarIds, setHiddenCalendarIds] = useState<Set<string>>(new Set());
  const [pendingSlot, setPendingSlot] = useState<PendingSlot | null>(null);
  const [pendingEventType, setPendingEventType] = useState<CalendarEventType>("STANDARD");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [pendingEventEdit, setPendingEventEdit] = useState<PendingEventEdit | null>(null);
  const [pendingEditCalendarId, setPendingEditCalendarId] = useState<string | null>(null);
  const [isPendingDragging, setIsPendingDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const pendingDragRef = useRef<{
    grabOffsetMin: number;
    durationMin: number;
    type: "move" | "resize";
  } | null>(null);
  const pendingSlotRef = useRef<PendingSlot | null>(null);
  dragStateRef.current = dragState;
  pendingSlotRef.current = pendingSlot;
  const dragEndedRef = useRef(false);
  const lastDraggedEventIdRef = useRef<string | null>(null);
  const isDragging = dragState !== null;
  const [manageState, setManageState] = useState<
    { open: true; calendar?: CalendarDef } | { open: false }
  >({ open: false });

  const t = useTranslations("calendar.dayView.newEvent");
  const columnsRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
  const utils = trpc.useUtils();

  // ── Data fetching ───────────────────────────────────────
  // No `initialData` here: the server-provided `initialCalendars` is trimmed to
  // `CalendarDef` (page.tsx), so it doesn't match the query's full row shape. The
  // `?? initialCalendars` fallback below renders it immediately either way.
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

  const eventsQuery = trpc.calendar.events.listForDay.useQuery(localDayRange(selectedDate), {
    refetchOnWindowFocus: false,
  });

  // ── Derived data ────────────────────────────────────────
  const toggleCalendar = useCallback((calendarId: string) => {
    setHiddenCalendarIds((prev) => {
      const next = new Set(prev);
      if (next.has(calendarId)) next.delete(calendarId);
      else next.add(calendarId);
      return next;
    });
  }, []);

  // Visible calendars drive both what renders and each event's color. Events
  // from every visible calendar are merged into one column (color-coded and
  // laid out side-by-side only where they overlap) rather than one column per
  // calendar, so empty calendars cost no horizontal space.
  const visibleCalendars = useMemo(
    () => calendars.filter((c) => !hiddenCalendarIds.has(c.id)),
    [calendars, hiddenCalendarIds],
  );
  const colorMap = useMemo(
    () => Object.fromEntries(calendars.map((c) => [c.id, c.color])),
    [calendars],
  );
  const visibleCalendarIds = useMemo(
    () => new Set(visibleCalendars.map((c) => c.id)),
    [visibleCalendars],
  );
  const pendingEditEventId = dragState?.eventId ?? pendingEventEdit?.eventId ?? null;

  const { timedEvents, allDayEvents } = useMemo<{
    timedEvents: CalendarEvent[];
    allDayEvents: CalendarEvent[];
  }>(() => {
    const raw = eventsQuery.data ?? [];
    const timed: CalendarEvent[] = [];
    const allDay: CalendarEvent[] = [];
    for (const ev of raw) {
      if (!visibleCalendarIds.has(ev.calendarId)) continue;
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
      if (ev.eventType === "ALL_DAY") allDay.push(converted);
      else timed.push(converted);
    }

    // Position override: live drag wins, then a post-drop pending edit. Both
    // match by id across the merged list.
    const override = dragState
      ? (ev: CalendarEvent) => {
          if (ev.id !== dragState.eventId) return ev;
          const startAt = new Date(selectedDate);
          startAt.setHours(
            Math.floor(dragState.currentStartMin / 60),
            dragState.currentStartMin % 60,
            0,
            0,
          );
          const endAt = new Date(selectedDate);
          endAt.setHours(
            Math.floor(dragState.currentEndMin / 60),
            dragState.currentEndMin % 60,
            0,
            0,
          );
          return { ...ev, startAt, endAt };
        }
      : pendingEventEdit
        ? (ev: CalendarEvent) => {
            if (ev.id !== pendingEventEdit.eventId) return ev;
            return { ...ev, startAt: pendingEventEdit.startAt, endAt: pendingEventEdit.endAt };
          }
        : null;
    let merged = override ? timed.map(override) : timed;

    // Calendar-switch ghost: recolor the edited/created event to the target
    // calendar immediately (no column to move between now).
    if (pendingEditCalendarId) {
      const targetEventId = pendingEventEdit?.eventId ?? selectedEventId;
      if (targetEventId) {
        merged = merged.map((ev) =>
          ev.id === targetEventId
            ? { ...ev, calendarId: pendingEditCalendarId, color: colorMap[pendingEditCalendarId] }
            : ev,
        );
      }
    }

    // Ghost slot for in-progress event creation (hidden when ALL_DAY selected).
    if (pendingSlot?.columnId && pendingEventType !== "ALL_DAY") {
      const startAt = new Date(selectedDate);
      startAt.setHours(pendingSlot.startTime.hour, pendingSlot.startTime.minute, 0, 0);
      const endAt =
        pendingEventType === "PUNCTUAL"
          ? new Date(startAt)
          : (() => {
              const d = new Date(selectedDate);
              d.setHours(pendingSlot.endTime.hour, pendingSlot.endTime.minute, 0, 0);
              return d;
            })();
      merged = [
        ...merged,
        {
          id: "__pending__",
          calendarId: pendingSlot.columnId,
          color: colorMap[pendingSlot.columnId],
          startAt,
          endAt,
          title: t("heading"),
          eventType: pendingEventType,
        },
      ];
    }
    return { timedEvents: merged, allDayEvents: allDay };
  }, [
    eventsQuery.data,
    visibleCalendarIds,
    colorMap,
    pendingSlot,
    pendingEventType,
    selectedDate,
    t,
    dragState,
    pendingEventEdit,
    pendingEditCalendarId,
    selectedEventId,
  ]);

  const hasAllDayEvents = allDayEvents.length > 0;

  // ── Mutations ───────────────────────────────────────────
  const createEvent = trpc.calendar.events.create.useMutation();
  const updateEvent = trpc.calendar.events.update.useMutation();
  const deleteEvent = trpc.calendar.events.delete.useMutation();
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

  // ── RBAC: roles for the manage dialog ──────────────────
  const myRolesQuery = trpc.rbac.myRoles.useQuery(undefined, { refetchOnWindowFocus: false });
  const roles = useMemo(
    () => (myRolesQuery.data ?? []).map((r) => ({ id: r.id, name: r.name })),
    [myRolesQuery.data],
  );

  // ── Handlers ────────────────────────────────────────────
  const clearPopover = useCallback(() => {
    setPopoverState(null);
    setSelectedEventId(null);
    setPendingSlot(null);
    setPendingEventEdit(null);
    setPendingEventType("STANDARD");
    setPendingEditCalendarId(null);
  }, []);

  // Closes the popover UI without discarding the pending edit/slot state.
  // Used for click-outside so the event block stays at its previewed position.
  const dismissPopover = useCallback(() => {
    setPopoverState(null);
  }, []);

  const handleSlotClick = useCallback(
    (
      _columnId: string,
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
      // One merged column, so a slot click can't imply a calendar — default to
      // the first visible one ; the popover's calendar picker changes it.
      const defaultCal = visibleCalendars[0]?.id ?? calendars[0]?.id ?? "";
      const endTime = addOneHour(time);
      setSelectedEventId(null);
      setPendingEventType("STANDARD");
      setPendingEventEdit(null);
      setPendingEditCalendarId(null);
      setPendingSlot({ columnId: defaultCal, startTime: time, endTime });
      setPopoverState({
        mode: "create",
        anchorX,
        anchorY,
        side,
        startTime: time,
        defaultCalendarId: defaultCal || undefined,
      });
    },
    [calendars, visibleCalendars],
  );

  const handleEventClick = useCallback(
    (event: CalendarEvent, anchorX: number, anchorY: number, side: "left" | "right" = "right") => {
      // Suppress click when a real drag just finished on this element
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
            defaultCalendarId: ps.columnId,
          });
        }
        return;
      }
      setSelectedEventId(event.id);
      setPendingSlot(null);
      // Initialize pendingEventEdit so time/date changes in the form update the calendar block in real-time
      setPendingEventEdit({
        eventId: event.id,
        columnId: event.calendarId,
        startAt: event.startAt,
        endAt: event.endAt,
      });
      setPopoverState({ mode: "edit", anchorX, anchorY, side, event });
    },
    [],
  );

  const handleDragStart = useCallback(
    (params: {
      event: CalendarEvent;
      columnId: string;
      type: "move" | "resize";
      clientY: number;
    }) => {
      const { event, columnId, type, clientY } = params;

      // Pending creation block drag: move the slot without clearing it
      if (event.id === "__pending__") {
        if (!columnsRef.current || !pendingSlotRef.current) return;
        const ps = pendingSlotRef.current;
        const rect = columnsRef.current.getBoundingClientRect();
        const scrollTop = columnsRef.current.scrollTop;
        const yInSchedule = clientY - rect.top + scrollTop;
        const cursorMin = (yInSchedule / TOTAL_HEIGHT_PX) * (24 * 60);
        const startMin = ps.startTime.hour * 60 + ps.startTime.minute;
        const endMin = ps.endTime.hour * 60 + ps.endTime.minute;
        const durationMin = Math.max(endMin - startMin, 15);
        pendingDragRef.current =
          type === "resize"
            ? { grabOffsetMin: cursorMin - endMin, durationMin, type: "resize" }
            : { grabOffsetMin: cursorMin - startMin, durationMin, type: "move" };
        setPopoverState(null);
        setIsPendingDragging(true);
        return;
      }

      if (!columnsRef.current) return;
      const startMin = event.startAt.getHours() * 60 + event.startAt.getMinutes();
      const endMin = event.endAt.getHours() * 60 + event.endAt.getMinutes();
      const isPunctual =
        event.eventType === "PUNCTUAL" || event.startAt.getTime() === event.endAt.getTime();
      const durationMin = isPunctual ? 0 : Math.max(endMin - startMin, 15);
      const rect = columnsRef.current.getBoundingClientRect();
      const scrollTop = columnsRef.current.scrollTop;
      const yInSchedule = clientY - rect.top + scrollTop;
      const cursorMin = (yInSchedule / TOTAL_HEIGHT_PX) * (24 * 60);
      clearPopover();
      setDragState({
        eventId: event.id,
        columnId,
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
    [clearPopover],
  );

  const handleSidebarCreate = useCallback(
    ({
      calendarId,
      startAt,
      eventType: presetType,
    }: {
      calendarId: string;
      startAt: Date;
      endAt: Date;
      eventType?: CalendarEventType;
    }) => {
      const type = presetType ?? "STANDARD";
      const startTime = { hour: startAt.getHours(), minute: startAt.getMinutes() };
      const endTime = addOneHour(startTime);
      const startMin = startAt.getHours() * 60 + startAt.getMinutes();
      // Scroll to event before computing viewport-relative anchor so the
      // popover appears on-screen even for afternoon events on first mount.
      if (columnsRef.current) {
        const eventYInGrid = (startMin / (24 * 60)) * TOTAL_HEIGHT_PX;
        columnsRef.current.scrollTop = Math.max(0, eventYInGrid - HOUR_HEIGHT_PX);
      }
      const columnsRect = columnsRef.current?.getBoundingClientRect();
      const scrollTop = columnsRef.current?.scrollTop ?? 0;
      const anchorX = (columnsRect?.left ?? 0) + 64;
      const anchorY = (columnsRect?.top ?? 0) + (startMin / 60) * HOUR_HEIGHT_PX - scrollTop;
      setSelectedEventId(null);
      setPendingEventType(type);
      setPendingSlot({ columnId: calendarId, startTime, endTime });
      setPopoverState({
        mode: "create",
        anchorX,
        anchorY,
        side: "right",
        startTime,
        defaultCalendarId: calendarId,
      });
    },
    [],
  );

  const handleTimeChange = useCallback(
    (startTime: CalendarEventTime, endTime: CalendarEventTime) => {
      setPendingSlot((prev) => (prev ? { ...prev, startTime, endTime } : null));
      // Also update the live preview for edit mode
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

  const handleDateChange = useCallback((date: Date) => {
    // When the user picks a different day in the form, move the calendar block preview
    setPendingEventEdit((prev) => {
      if (!prev) return null;
      const newStart = new Date(date);
      newStart.setHours(prev.startAt.getHours(), prev.startAt.getMinutes(), 0, 0);
      const newEnd = new Date(date);
      newEnd.setHours(prev.endAt.getHours(), prev.endAt.getMinutes(), 0, 0);
      return { ...prev, startAt: newStart, endAt: newEnd };
    });
  }, []);

  const handleCalendarChange = useCallback(
    (calendarId: string) => {
      const colEl = columnsRef.current?.querySelector<HTMLElement>(`[data-col-id="${calendarId}"]`);
      const rect = colEl?.getBoundingClientRect();

      if (popoverState?.mode === "create") {
        setPendingSlot((prev) => (prev ? { ...prev, columnId: calendarId } : null));
        if (rect) {
          const side: "left" | "right" = window.innerWidth - rect.right < 660 ? "left" : "right";
          setPopoverState((prev) =>
            prev ? { ...prev, anchorX: side === "left" ? rect.left : rect.right, side } : null,
          );
        }
      } else if (popoverState?.mode === "edit" && popoverState.event) {
        const original = popoverState.event.calendarId;
        setPendingEditCalendarId(calendarId === original ? null : calendarId);
        if (rect) {
          const side: "left" | "right" = window.innerWidth - rect.right < 660 ? "left" : "right";
          setPopoverState((prev) =>
            prev ? { ...prev, anchorX: side === "left" ? rect.left : rect.right, side } : null,
          );
        }
      }
    },
    [popoverState],
  );

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
      await utils.calendar.events.listForDay.invalidate(localDayRange(selectedDate));
      clearPopover();
    },
    [createEvent, clearPopover, selectedDate, utils.calendar.events.listForDay],
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
      await utils.calendar.events.listForDay.invalidate(localDayRange(selectedDate));
      clearPopover();
    },
    [updateEvent, clearPopover, selectedDate, utils.calendar.events.listForDay],
  );

  const handleEventDelete = useCallback(
    async (eventId: string) => {
      await deleteEvent.mutateAsync({ id: eventId });
      await utils.calendar.events.listForDay.invalidate(localDayRange(selectedDate));
      clearPopover();
    },
    [deleteEvent, clearPopover, selectedDate, utils.calendar.events.listForDay],
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
      clearPopover();
      await deleteCalendar.mutateAsync({ id: calendarId });
    },
    [deleteCalendar.mutateAsync, clearPopover],
  );

  const handleSidebarDelete = useCallback(
    async (calendarId: string) => {
      clearPopover();
      await deleteCalendar.mutateAsync({ id: calendarId });
    },
    [deleteCalendar.mutateAsync, clearPopover],
  );

  // Open the popover for a notification/search-navigated event once its data arrives.
  // Smooth-scrolls to the event first, then waits for the animation to settle
  // before anchoring and opening the popover.
  useEffect(() => {
    if (!focusEventId || !eventsQuery.data) return;
    const raw = (
      eventsQuery.data as Array<{
        id: string;
        calendarId: string;
        startAt: string;
        endAt: string;
        title: string;
        description?: string | null;
        location?: string | null;
        participants?: string[] | null;
        eventType?: string | null;
      }>
    ).find((ev) => ev.id === focusEventId);
    // Clear the pending focus even if event not found (wrong day, hidden calendar, etc.)
    if (!raw) {
      onEventFocused?.();
      return;
    }

    const event: CalendarEvent = {
      ...raw,
      startAt: new Date(raw.startAt),
      endAt: new Date(raw.endAt),
      eventType: (raw.eventType as CalendarEventType | null) ?? undefined,
      description: raw.description ?? undefined,
      location: raw.location ?? undefined,
      participants: raw.participants ?? undefined,
    };

    const startMin = event.startAt.getHours() * 60 + event.startAt.getMinutes();
    const eventYInGrid = (startMin / (24 * 60)) * TOTAL_HEIGHT_PX;
    const targetScrollTop = Math.max(0, eventYInGrid - HOUR_HEIGHT_PX);
    columnsRef.current?.scrollTo({ top: targetScrollTop, behavior: "smooth" });

    // Delay opening the popover until the smooth scroll has finished (~300ms)
    // so the anchor is computed against the settled scroll position.
    const timer = setTimeout(() => {
      const columnsRect = columnsRef.current?.getBoundingClientRect();
      const anchorX = (columnsRect?.left ?? 80) + 80;
      const anchorY = (columnsRect?.top ?? 0) + Math.min(eventYInGrid, HOUR_HEIGHT_PX);
      setSelectedEventId(event.id);
      setPendingSlot(null);
      setPendingEventEdit({
        eventId: event.id,
        columnId: event.calendarId,
        startAt: event.startAt,
        endAt: event.endAt,
      });
      setPopoverState({ mode: "edit", anchorX, anchorY, side: "right", event });
      onEventFocused?.();
    }, 350);
    return () => clearTimeout(timer);
  }, [focusEventId, eventsQuery.data]);

  // Trigger ghost-event creation when navigating here from another view.
  // Waits a short frame for the freshly mounted DayView to finish layout
  // before computing DOM positions for the popover anchor.
  useEffect(() => {
    if (!pendingCreateDefaults) return;
    const defaults = pendingCreateDefaults;
    const { startAt } = defaults;
    const startMin = startAt.getHours() * 60 + startAt.getMinutes();
    const eventYInGrid = (startMin / (24 * 60)) * TOTAL_HEIGHT_PX;
    const targetScrollTop = Math.max(0, eventYInGrid - HOUR_HEIGHT_PX);
    if (columnsRef.current) {
      columnsRef.current.scrollTop = targetScrollTop;
    }
    const timer = setTimeout(() => {
      handleSidebarCreate(defaults);
      onPendingCreateConsumed?.();
    }, 150);
    return () => clearTimeout(timer);
  }, [pendingCreateDefaults]);

  // On first open, scroll the timeline so the current time is in view (with a
  // couple of hours of lead-in above it). Skipped when we're navigating
  // straight to a specific event / create slot, which own the scroll position.
  useLayoutEffect(() => {
    if (didInitialScrollRef.current) return;
    if (focusEventId || pendingCreateDefaults) return;
    const el = columnsRef.current;
    if (!el) return;
    didInitialScrollRef.current = true;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowY = (nowMin / (24 * 60)) * TOTAL_HEIGHT_PX;
    el.scrollTop = Math.max(0, nowY - HOUR_HEIGHT_PX * 2);
  }, [focusEventId, pendingCreateDefaults]);

  // Document-level mouse tracking while dragging an event block
  useLayoutEffect(() => {
    if (!isDragging) return;

    function onPointerMove(e: PointerEvent) {
      const ds = dragStateRef.current;
      if (!ds || !columnsRef.current) return;
      const rect = columnsRef.current.getBoundingClientRect();
      const scrollTop = columnsRef.current.scrollTop;
      const yInSchedule = e.clientY - rect.top + scrollTop;
      const cursorMin = (yInSchedule / TOTAL_HEIGHT_PX) * (24 * 60);

      setDragState((prev) => {
        if (!prev) return null;
        if (prev.type === "move") {
          const rawStart = cursorMin - prev.grabOffsetMin;
          const newStart = Math.max(
            0,
            Math.min(Math.round(rawStart / 15) * 15, 24 * 60 - prev.durationMin),
          );
          const moved = Math.abs(newStart - prev.initialStartMin) >= 5;
          return {
            ...prev,
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

      const startAt = new Date(selectedDate);
      startAt.setHours(Math.floor(ds.currentStartMin / 60), ds.currentStartMin % 60, 0, 0);
      const endAt = new Date(selectedDate);
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

      // Keep the event at the new position as a ghost until the user saves or cancels
      setPendingEventEdit({ eventId: ds.eventId, columnId: ds.columnId, startAt, endAt });

      setSelectedEventId(ds.eventId);
      setPendingSlot(null);
      setPopoverState({
        mode: "edit",
        anchorX: e.clientX,
        anchorY: e.clientY,
        side: window.innerWidth - e.clientX < 660 ? "left" : "right",
        event: updatedEvent,
      });
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [isDragging]);

  // Global cursor override while dragging
  useEffect(() => {
    if (!dragState) return;
    const cursor = dragState.type === "move" ? "grabbing" : "s-resize";
    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, dragState?.type]);

  // Pending creation block drag: mousemove updates slot, mouseup reopens popover
  useLayoutEffect(() => {
    if (!isPendingDragging) return;

    function onPointerMove(e: PointerEvent) {
      const pd = pendingDragRef.current;
      if (!pd || !columnsRef.current) return;
      const rect = columnsRef.current.getBoundingClientRect();
      const scrollTop = columnsRef.current.scrollTop;
      const yInSchedule = e.clientY - rect.top + scrollTop;
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
        defaultCalendarId: ps.columnId,
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

  return (
    <div className="flex h-full flex-col overflow-hidden md:flex-row">
      <CalendarSidebar
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        calendars={calendars}
        hiddenCalendarIds={hiddenCalendarIds}
        onToggleCalendar={toggleCalendar}
        canManage={canManage}
        canDelete={canDelete}
        onAddCalendar={() => setManageState({ open: true, calendar: undefined })}
        onEditCalendar={(cal) => setManageState({ open: true, calendar: cal })}
        onDeleteCalendar={handleSidebarDelete}
      />

      {/* Single scroll container — timeline + columns scroll together */}
      <div
        ref={columnsRef}
        className="relative flex-1"
        style={{ overflowY: popoverState || isPendingDragging ? "hidden" : "auto" }}
      >
        {/* Sticky all-day row (only when there are all-day events). The old
            per-calendar name/date header row is gone — it reserved height with
            nothing useful to show now that calendars are merged into one grid. */}
        {hasAllDayEvents && (
          <div className="sticky top-0 z-40 flex border-b border-border bg-background shadow-sm">
            <div className="w-12 shrink-0 border-r border-border py-1 md:w-16" />
            <div className="flex flex-1 flex-col gap-px px-1 py-1 min-w-0">
              {allDayEvents.map((ev) => {
                const borderColor = ev.color ?? undefined;
                const bgColor = ev.color ? `${ev.color}4D` : undefined;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    className={`truncate rounded-sm border-l-2 px-1 text-left text-xs font-medium leading-5 ${selectedEventId === ev.id ? "ring-2 ring-primary" : ""} ${!ev.color ? "border-primary bg-primary/15 text-foreground" : "text-foreground"}`}
                    style={{ borderLeftColor: borderColor, backgroundColor: bgColor }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const side: "left" | "right" =
                        window.innerWidth - rect.right < 660 ? "left" : "right";
                      handleEventClick(
                        ev,
                        side === "left" ? rect.left : rect.right,
                        rect.top,
                        side,
                      );
                    }}
                  >
                    {ev.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable body: hour labels + one merged, color-coded schedule */}
        <div className="flex">
          <DayTimeline date={selectedDate} hideHeader />
          <div className="relative flex-1" style={{ height: TOTAL_HEIGHT_PX }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="pointer-events-none absolute left-0 right-0 border-t border-border"
                style={{ top: h * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX }}
                aria-hidden
              />
            ))}
            <CurrentTimeIndicator />
            <DaySchedule
              columnId="day"
              events={timedEvents}
              selectedEventId={selectedEventId}
              pendingEditEventId={pendingEditEventId}
              onSlotClick={handleSlotClick}
              onEventClick={handleEventClick}
              onDragStart={(event, _columnId, type, clientY) =>
                handleDragStart({ event, columnId: event.calendarId, type, clientY })
              }
            />
          </div>
        </div>
      </div>

      {/* Popover — anchored to viewport coordinates captured at click time */}
      {popoverState && (
        <NewEventPopover
          open
          anchorX={popoverState.anchorX}
          anchorY={popoverState.anchorY}
          side={popoverState.side}
          mode={popoverState.mode}
          startTime={popoverState.mode === "create" ? popoverState.startTime : undefined}
          selectedDate={selectedDate}
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
