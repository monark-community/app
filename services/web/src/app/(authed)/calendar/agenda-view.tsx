"use client";

import { useCallback, useMemo, useState, type MouseEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CalendarDef, CalendarEvent, CalendarViewSettings } from "@monark/calendar/contracts";
import { formatClockTime } from "@monark/calendar/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { CalendarSidebar } from "./calendar-sidebar";
import { CalendarManageDialog } from "./calendar-manage-dialog";
import { NewEventPopover, type NewEventSubmitPayload } from "./new-event-popover";

const PAGE_SIZE = 25;

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

type AgendaPopoverState =
  | { mode: "create"; anchorX: number; anchorY: number; defaultCalendarId?: string }
  | { mode: "edit"; anchorX: number; anchorY: number; event: CalendarEvent }
  | null;

export function AgendaView({
  fromDate,
  onDateChange,
  initialCalendars,
  canManage,
  canDelete,
  settings,
}: {
  fromDate: Date;
  onDateChange: (date: Date) => void;
  initialCalendars: CalendarDef[];
  canManage?: boolean;
  canDelete?: boolean;
  settings: CalendarViewSettings;
}) {
  const t = useTranslations("calendar.agendaView");
  const locale = useLocale();
  const utils = trpc.useUtils();

  const [hiddenCalendarIds, setHiddenCalendarIds] = useState(new Set<string>());
  const [manageState, setManageState] = useState<
    { open: true; calendar?: CalendarDef } | { open: false }
  >({ open: false });
  const [popoverState, setPopoverState] = useState<AgendaPopoverState>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const toggleCalendar = useCallback((calendarId: string) => {
    setHiddenCalendarIds((prev) => {
      const next = new Set(prev);
      if (next.has(calendarId)) next.delete(calendarId);
      else next.add(calendarId);
      return next;
    });
  }, []);

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
  const calendarMap = useMemo(
    () => Object.fromEntries(calendars.map((c) => [c.id, c])),
    [calendars],
  );

  const fromIso = useMemo(() => {
    const d = new Date(fromDate);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [fromDate]);

  const agendaQuery = trpc.calendar.events.listAgenda.useInfiniteQuery(
    { from: fromIso, limit: PAGE_SIZE },
    { getNextPageParam: (page) => page.nextCursor ?? undefined },
  );

  const groups = useMemo(() => {
    const rows = (agendaQuery.data?.pages ?? []).flatMap((p) => p.items);
    const byDay = new Map<string, { date: Date; events: (CalendarEvent & { id: string })[] }>();
    for (const ev of rows) {
      if (hiddenCalendarIds.has(ev.calendarId)) continue;
      const startAt = new Date(ev.startAt);
      const endAt = new Date(ev.endAt);
      const key = dayKey(startAt);
      if (!byDay.has(key)) byDay.set(key, { date: startAt, events: [] });
      byDay.get(key)!.events.push({
        id: ev.id,
        calendarId: ev.calendarId,
        title: ev.title,
        startAt,
        endAt,
        eventType: (ev.eventType as CalendarEvent["eventType"]) ?? undefined,
        description: ev.description ?? undefined,
        location: ev.location ?? undefined,
        participants: ev.participants ?? undefined,
        reminders: ev.reminders?.map((r) => r.minutesBefore) ?? undefined,
      });
    }
    return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [agendaQuery.data, hiddenCalendarIds]);

  const today = useMemo(() => new Date(), []);

  const createCalendarMutation = trpc.calendar.calendars.create.useMutation({
    onSuccess: () => utils.calendar.calendars.list.invalidate(),
  });
  const updateCalendarMutation = trpc.calendar.calendars.update.useMutation({
    onSuccess: () => utils.calendar.calendars.list.invalidate(),
  });
  const deleteCalendarMutation = trpc.calendar.calendars.delete.useMutation({
    onSuccess: () => {
      void utils.calendar.calendars.list.invalidate();
      void utils.calendar.events.listAgenda.invalidate();
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

  const closePopover = useCallback(() => {
    setPopoverState(null);
    setSelectedEventId(null);
  }, []);

  function handleAddEvent(e: MouseEvent) {
    setSelectedEventId(null);
    setPopoverState({
      mode: "create",
      anchorX: e.clientX,
      anchorY: e.clientY,
      defaultCalendarId: calendars[0]?.id,
    });
  }

  function handleEventClick(ev: CalendarEvent, e: MouseEvent) {
    e.stopPropagation();
    setSelectedEventId(ev.id);
    setPopoverState({ mode: "edit", anchorX: e.clientX, anchorY: e.clientY, event: ev });
  }

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
      await utils.calendar.events.listAgenda.invalidate();
      closePopover();
    },
    [createEvent, utils, closePopover],
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
      await utils.calendar.events.listAgenda.invalidate();
      closePopover();
    },
    [updateEvent, utils, closePopover],
  );

  const handleEventDelete = useCallback(
    async (eventId: string) => {
      await deleteEvent.mutateAsync({ id: eventId });
      await utils.calendar.events.listAgenda.invalidate();
      closePopover();
    },
    [deleteEvent, utils, closePopover],
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
      closePopover();
      await deleteCalendarMutation.mutateAsync({ id: calendarId });
    },
    [deleteCalendarMutation.mutateAsync, closePopover],
  );

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric" }),
    [locale],
  );

  return (
    <div className="flex h-full overflow-hidden">
      <CalendarSidebar
        selectedDate={fromDate}
        weekStartsOn={settings.weekStartsOn}
        timeFormat={settings.timeFormat}
        onDateChange={onDateChange}
        calendars={calendars}
        hiddenCalendarIds={hiddenCalendarIds}
        onToggleCalendar={toggleCalendar}
        canManage={canManage ?? false}
        canDelete={canDelete}
        onAddCalendar={() => setManageState({ open: true, calendar: undefined })}
        onEditCalendar={(cal) => setManageState({ open: true, calendar: cal })}
        onDeleteCalendar={handleCalendarDelete}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
          <p className="text-sm font-semibold text-foreground">{t("title")}</p>
          <Button type="button" size="sm" className="gap-1.5" onClick={handleAddEvent}>
            <Plus className="h-3.5 w-3.5" />
            {t("addEvent")}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {agendaQuery.isLoading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : groups.length === 0 ? (
            <p className="px-1 py-4 text-sm text-muted-foreground">{t("noUpcomingEvents")}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <div key={dayKey(group.date)} className="flex flex-col gap-1">
                  <p
                    className={`px-1 text-xs font-semibold uppercase tracking-wide ${
                      isSameDay(group.date, today) ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {isSameDay(group.date, today) ? t("today") : dateFormatter.format(group.date)}
                  </p>
                  <div className="flex flex-col gap-1">
                    {group.events.map((ev) => {
                      const cal = calendarMap[ev.calendarId];
                      const isAllDay = ev.eventType === "ALL_DAY";
                      const isPunctual = ev.eventType === "PUNCTUAL";
                      const timeStr =
                        !isAllDay && !isPunctual
                          ? formatClockTime(ev.startAt, settings.timeFormat)
                          : null;
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={(e) => handleEventClick(ev, e)}
                          className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
                            selectedEventId === ev.id ? "ring-2 ring-primary" : ""
                          }`}
                          style={{
                            backgroundColor: cal?.color
                              ? `${cal.color}1a`
                              : "hsl(var(--primary) / 0.08)",
                            borderLeft: `3px solid ${cal?.color ?? "hsl(var(--primary))"}`,
                          }}
                        >
                          {timeStr && (
                            <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                              {timeStr}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate font-medium">{ev.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {agendaQuery.hasNextPage && (
                <div className="flex justify-center py-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void agendaQuery.fetchNextPage()}
                    disabled={agendaQuery.isFetchingNextPage}
                  >
                    {agendaQuery.isFetchingNextPage ? t("loading") : t("loadMore")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {popoverState && (
        <NewEventPopover
          open
          anchorX={popoverState.anchorX}
          anchorY={popoverState.anchorY}
          side={window.innerWidth - popoverState.anchorX < 660 ? "left" : "right"}
          mode={popoverState.mode}
          selectedDate={popoverState.mode === "edit" ? popoverState.event.startAt : fromDate}
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
