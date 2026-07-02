"use client";

import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fr as frLocale, enUS } from "react-day-picker/locale";
import { Archive, Check, MoreHorizontal, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { CalendarDef } from "@monark/calendar/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { pickContrastForeground } from "@/lib/color-contrast";
import { trpc } from "@/lib/trpc";

type TodayEvent = {
  id: string;
  calendarId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  eventType?: string | null;
};

export function CalendarSidebar({
  selectedDate,
  weekRange,
  onDateChange,
  calendars,
  hiddenCalendarIds,
  onToggleCalendar,
  canManage,
  canDelete,
  onAddCalendar,
  onEditCalendar,
  onDeleteCalendar,
  hideDatePicker,
  todayEvents,
}: {
  selectedDate: Date;
  weekRange?: { from: Date; to: Date };
  onDateChange: (date: Date) => void;
  calendars: CalendarDef[];
  hiddenCalendarIds: Set<string>;
  onToggleCalendar: (calendarId: string) => void;
  canManage: boolean;
  canDelete?: boolean;
  onAddCalendar: () => void;
  onEditCalendar: (calendar: CalendarDef) => void;
  onDeleteCalendar: (calendarId: string) => void;
  hideDatePicker?: boolean;
  todayEvents?: TodayEvent[];
}) {
  const t = useTranslations("calendar.sidebar");
  const tCommon = useTranslations("common");
  const locale = useLocale() === "fr" ? frLocale : enUS;
  const [pendingDelete, setPendingDelete] = useState<CalendarDef | null>(null);
  const confirmedDeleteIdRef = useRef<string | null>(null);

  // Archived (soft-deleted) calendars are managed here, self-contained : a
  // toggle fetches the include-deleted list and offers a Restore action, so
  // the views don't need to thread archived state through their queries.
  const utils = trpc.useUtils();
  const [showArchived, setShowArchived] = useState(false);
  const archivedQuery = trpc.calendar.calendars.list.useQuery(
    { includeDeleted: true },
    { enabled: showArchived && canManage, refetchOnWindowFocus: false },
  );
  const archived = useMemo(
    () => (archivedQuery.data ?? []).filter((c) => c.deletedAt != null),
    [archivedQuery.data],
  );
  const restoreCalendar = trpc.calendar.calendars.restore.useMutation({
    onSuccess: () => {
      toast.success(t("restoreSuccess"));
      void utils.calendar.calendars.list.invalidate();
    },
    onError: (err) => toast.error(t("restoreError", { message: err.message })),
  });
  const calMap = useMemo(() => Object.fromEntries(calendars.map((c) => [c.id, c])), [calendars]);

  // Mobile: a long-press on a calendar chip opens a bottom action drawer (edit /
  // delete), since the chip's tap is already spoken for by the visibility toggle.
  const [actionSheetCal, setActionSheetCal] = useState<CalendarDef | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  function cancelLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }
  function startLongPress(cal: CalendarDef, e: React.PointerEvent) {
    longPressFiredRef.current = false;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setActionSheetCal(cal);
    }, 450);
  }
  // A drag past the threshold is a strip-scroll, not a hold — let it scroll.
  function onLongPressMove(e: React.PointerEvent) {
    const start = pointerStartRef.current;
    if (!start) return;
    if (Math.abs(e.clientX - start.x) > 8 || Math.abs(e.clientY - start.y) > 8) cancelLongPress();
  }

  // Track the displayed month so the mini-calendar navigates when Today button fires
  const activeMonth = weekRange?.from ?? selectedDate;
  const activeMonthKey = `${activeMonth.getFullYear()}-${activeMonth.getMonth()}`;
  const prevMonthKeyRef = useRef(activeMonthKey);
  const [displayMonth, setDisplayMonth] = useState(activeMonth);
  if (prevMonthKeyRef.current !== activeMonthKey) {
    prevMonthKeyRef.current = activeMonthKey;
    setDisplayMonth(activeMonth);
  }

  return (
    <>
      <aside className="hidden w-68.75 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-4 md:flex">
        {hideDatePicker ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("todayEvents")}
            </p>
            {!todayEvents?.length ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">{t("noEventsToday")}</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {todayEvents.map((ev) => {
                  const cal = calMap[ev.calendarId];
                  const isAllDay = ev.eventType === "ALL_DAY";
                  const isPunctual = ev.eventType === "PUNCTUAL";
                  const timeStr =
                    !isAllDay && !isPunctual
                      ? `${String(ev.startAt.getHours()).padStart(2, "0")}:${String(ev.startAt.getMinutes()).padStart(2, "0")}`
                      : null;
                  return (
                    <div
                      key={ev.id}
                      className="flex min-w-0 items-center gap-1.5 rounded px-2 py-1 text-xs"
                      style={{
                        backgroundColor: cal?.color
                          ? `${cal.color}1a`
                          : "hsl(var(--primary) / 0.1)",
                        borderLeft: `2px solid ${cal?.color ?? "hsl(var(--primary))"}`,
                      }}
                    >
                      {timeStr && <span className="shrink-0 text-muted-foreground">{timeStr}</span>}
                      <span className="truncate font-medium">{ev.title}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : weekRange ? (
          <Calendar
            mode="range"
            locale={locale}
            weekStartsOn={0}
            selected={weekRange}
            month={displayMonth}
            onMonthChange={setDisplayMonth}
            onSelect={(_range, triggerDate) => onDateChange(triggerDate)}
            className="rounded-md border border-border p-2"
          />
        ) : (
          <Calendar
            mode="single"
            locale={locale}
            weekStartsOn={0}
            selected={selectedDate}
            month={displayMonth}
            onMonthChange={setDisplayMonth}
            onSelect={(date) => date && onDateChange(date)}
            className="rounded-md border border-border p-2"
          />
        )}

        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("myCalendars")}
          </p>
          {calendars.map((cal) => {
            const isVisible = !hiddenCalendarIds.has(cal.id);
            const calColor = cal.color ?? "hsl(var(--primary))";
            return (
              <div
                key={cal.id}
                className="group flex w-full items-center gap-1 rounded-md px-2 py-1 hover:bg-accent"
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isVisible}
                  aria-label={isVisible ? `Hide ${cal.name}` : `Show ${cal.name}`}
                  onClick={() => onToggleCalendar(cal.id)}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-2 transition-colors"
                  style={{
                    borderColor: calColor,
                    backgroundColor: isVisible ? calColor : "transparent",
                  }}
                >
                  {isVisible && (
                    <Check
                      className="h-2.5 w-2.5"
                      strokeWidth={3}
                      style={{ color: pickContrastForeground(calColor) }}
                    />
                  )}
                </button>
                <span className="flex-1 truncate text-sm">{cal.name}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={t("moreOptions")}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onClick={() => onEditCalendar(cal)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      {t("editCalendar")}
                    </DropdownMenuItem>
                    {canDelete && (
                      <DropdownMenuItem
                        className={cal.isPersonal ? "cursor-not-allowed opacity-50" : undefined}
                        disabled={cal.isPersonal}
                        onClick={() => !cal.isPersonal && setPendingDelete(cal)}
                      >
                        <Archive className="mr-2 h-3.5 w-3.5" />
                        {t("archiveCalendar")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
          {canManage && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={onAddCalendar}
            >
              <span className="h-3 w-3 shrink-0 text-center leading-none" aria-hidden>
                +
              </span>
              <span>{t("addCalendar")}</span>
            </button>
          )}
        </div>

        {canManage && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent"
              onClick={() => setShowArchived((v) => !v)}
              aria-expanded={showArchived}
            >
              <span>{t("archivedSection")}</span>
              <span aria-hidden>{showArchived ? "−" : "+"}</span>
            </button>
            {showArchived &&
              (archived.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">{t("noArchived")}</p>
              ) : (
                archived.map((cal) => (
                  <div
                    key={cal.id}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 hover:bg-accent"
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full opacity-40"
                      style={{ backgroundColor: cal.color ?? "hsl(var(--primary))" }}
                    />
                    <span className="flex-1 truncate text-sm text-muted-foreground">
                      {cal.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-xs"
                      disabled={restoreCalendar.isPending}
                      onClick={() => restoreCalendar.mutate({ id: cal.id })}
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden />
                      {t("restoreCalendar")}
                    </Button>
                  </div>
                ))
              ))}
          </div>
        )}
      </aside>

      {/* Mobile: horizontal calendar-toggle strip in place of the sidebar.
          Date-picker and today-events are dropped ; toolbar arrows navigate. */}
      <div className="flex shrink-0 flex-row items-center gap-1.5 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
        {calendars.map((cal) => {
          const isVisible = !hiddenCalendarIds.has(cal.id);
          const calColor = cal.color ?? "hsl(var(--primary))";
          return (
            <div
              key={cal.id}
              className="flex shrink-0 select-none items-center gap-0.5 whitespace-nowrap rounded-full border py-0.5 pl-3 pr-0.5 text-sm transition-colors"
              style={{
                borderColor: calColor,
                backgroundColor: isVisible ? `${calColor}1a` : "transparent",
                opacity: isVisible ? 1 : 0.55,
              }}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={isVisible}
                aria-label={isVisible ? `Hide ${cal.name}` : `Show ${cal.name}`}
                onPointerDown={(e) => startLongPress(cal, e)}
                onPointerMove={onLongPressMove}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => {
                  // Suppress the visibility toggle if this tap was consumed by a long-press.
                  if (longPressFiredRef.current) {
                    longPressFiredRef.current = false;
                    return;
                  }
                  onToggleCalendar(cal.id);
                }}
                className="flex items-center gap-1.5 py-0.5"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: calColor }}
                  aria-hidden
                />
                {cal.name}
              </button>
              <button
                type="button"
                aria-label={t("moreOptions")}
                onClick={() => setActionSheetCal(cal)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        {canManage && (
          <button
            type="button"
            onClick={onAddCalendar}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <span className="leading-none" aria-hidden>
              +
            </span>
            {t("addCalendar")}
          </button>
        )}
      </div>

      {/* Mobile long-press action drawer */}
      <Sheet
        open={actionSheetCal != null}
        onOpenChange={(open) => {
          if (!open) setActionSheetCal(null);
        }}
      >
        <SheetContent side="bottom" className="gap-3 rounded-t-xl p-4 pb-8">
          <SheetHeader>
            <SheetTitle className="truncate text-left">{actionSheetCal?.name}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm hover:bg-accent"
              onClick={() => {
                const cal = actionSheetCal;
                setActionSheetCal(null);
                if (cal) onEditCalendar(cal);
              }}
            >
              <Pencil className="h-4 w-4 shrink-0" />
              {t("editCalendar")}
            </button>
            {canDelete && (
              <button
                type="button"
                disabled={actionSheetCal?.isPersonal}
                className={
                  actionSheetCal?.isPersonal
                    ? "flex w-full cursor-not-allowed items-center gap-3 rounded-md px-3 py-3 text-left text-sm opacity-50"
                    : "flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm hover:bg-accent"
                }
                onClick={() => {
                  const cal = actionSheetCal;
                  setActionSheetCal(null);
                  if (cal && !cal.isPersonal) setPendingDelete(cal);
                }}
              >
                <Archive className="h-4 w-4 shrink-0" />
                {t("archiveCalendar")}
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={() => {
            const id = confirmedDeleteIdRef.current;
            if (id) {
              confirmedDeleteIdRef.current = null;
              void onDeleteCalendar(id);
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t("archiveConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("archiveConfirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDelete(null)}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) {
                  confirmedDeleteIdRef.current = pendingDelete.id;
                  setPendingDelete(null);
                }
              }}
            >
              {t("archiveConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
