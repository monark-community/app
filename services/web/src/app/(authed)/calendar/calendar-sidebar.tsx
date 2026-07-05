"use client";

import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fr as frLocale, enUS } from "react-day-picker/locale";
import { Archive, MoreHorizontal, Pencil, RotateCcw } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

type TodayEvent = {
  id: string;
  calendarId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  eventType?: string | null;
};

/** Translated chrome for a {@link CalendarChip} (kept out per the i18n rule). */
export interface CalendarChipLabels {
  more: string;
  edit: string;
  archive: string;
  show: string;
  hide: string;
}

/**
 * A calendar toggle pill: a rounded, calendar-colored border with a color dot
 * and name ; tapping the body toggles the calendar's visibility (active =
 * tinted fill, inactive = dimmed + transparent), and the trailing `…` opens an
 * edit / archive menu. One component for both the desktop sidebar (`fullWidth`,
 * stacked) and the mobile strip (content-width, inline-scrolling).
 */
export function CalendarChip({
  cal,
  visible,
  onToggle,
  onEdit,
  onArchive,
  canDelete,
  labels,
  fullWidth = false,
}: {
  cal: CalendarDef;
  visible: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onArchive: () => void;
  canDelete: boolean;
  labels: CalendarChipLabels;
  /** Stretch to fill the row (desktop sidebar) instead of sizing to content. */
  fullWidth?: boolean;
}) {
  const color = cal.color ?? "hsl(var(--primary))";
  return (
    <div
      className={cn(
        "flex min-w-0 select-none items-center gap-0.5 whitespace-nowrap rounded-full border py-0.5 pl-3 pr-0.5 text-sm transition-colors",
        fullWidth ? "w-full" : "shrink-0",
      )}
      style={{
        borderColor: color,
        backgroundColor: visible ? `${color}1a` : "transparent",
        opacity: visible ? 1 : 0.55,
      }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={visible}
        aria-label={visible ? labels.hide : labels.show}
        onClick={onToggle}
        className={cn("flex min-w-0 items-center gap-1.5 py-0.5", fullWidth && "flex-1")}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <span className="truncate">{cal.name}</span>
      </button>
      {/* Non-modal: selecting "Archive" opens the parent's modal AlertDialog.
          A modal menu sets `body { pointer-events: none }` while closing ; the
          dialog's dismissable layer then captures that `none` as the body's
          "original" and restores it to `none` on close, freezing the page.
          Keeping the menu non-modal means it never touches body pointer-events. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={labels.more}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            {labels.edit}
          </DropdownMenuItem>
          {canDelete && (
            <DropdownMenuItem
              className={cal.isPersonal ? "cursor-not-allowed opacity-50" : undefined}
              disabled={cal.isPersonal}
              onClick={() => !cal.isPersonal && onArchive()}
            >
              <Archive className="mr-2 h-3.5 w-3.5" />
              {labels.archive}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

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

  const chipLabels: CalendarChipLabels = {
    more: t("moreOptions"),
    edit: t("editCalendar"),
    archive: t("archiveCalendar"),
    show: t("showCalendar"),
    hide: t("hideCalendar"),
  };

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

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("myCalendars")}
          </p>
          <div className="flex flex-col gap-1.5">
            {calendars.map((cal) => (
              <CalendarChip
                key={cal.id}
                cal={cal}
                visible={!hiddenCalendarIds.has(cal.id)}
                onToggle={() => onToggleCalendar(cal.id)}
                onEdit={() => onEditCalendar(cal)}
                onArchive={() => setPendingDelete(cal)}
                canDelete={!!canDelete}
                labels={chipLabels}
                fullWidth
              />
            ))}
            {canManage && (
              <button
                type="button"
                onClick={onAddCalendar}
                className="flex w-full items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <span className="leading-none" aria-hidden>
                  +
                </span>
                {t("addCalendar")}
              </button>
            )}
          </div>
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

      {/* Mobile: horizontal calendar-chip strip in place of the sidebar.
          Date-picker and today-events are dropped ; toolbar arrows navigate. */}
      <div className="flex shrink-0 flex-row items-center gap-1.5 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
        {calendars.map((cal) => (
          <CalendarChip
            key={cal.id}
            cal={cal}
            visible={!hiddenCalendarIds.has(cal.id)}
            onToggle={() => onToggleCalendar(cal.id)}
            onEdit={() => onEditCalendar(cal)}
            onArchive={() => setPendingDelete(cal)}
            canDelete={!!canDelete}
            labels={chipLabels}
          />
        ))}
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

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
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
                const cal = pendingDelete;
                setPendingDelete(null);
                // Defer past the dialog's close cleanup: the delete's refetch
                // unmounts this subtree, and if that lands mid-close Radix never
                // restores `body` pointer-events, freezing the whole page.
                if (cal) setTimeout(() => void onDeleteCalendar(cal.id), 0);
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
