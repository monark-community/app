"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import type { CalendarDef, CalendarEventType } from "@monark/calendar/contracts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fr as frLocale, enUS } from "react-day-picker/locale";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { DayView } from "./day-view";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";

type CalendarViewType = "day" | "week" | "month";

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

// Accepts YYYY-MM-DD (navigation links) or epoch-ms string (notification links).
function parseDateParam(param: string | null, fallback: Date): Date {
  if (!param) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const [y, m, d] = param.split("-").map(Number);
    return new Date(y!, m! - 1, d!);
  }
  const ms = Number(param);
  return isNaN(ms) ? fallback : new Date(ms);
}

function formatDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type PendingCreateDefaults = {
  calendarId: string;
  startAt: Date;
  endAt: Date;
  eventType?: CalendarEventType;
};

export function CalendarShell({
  initialDate,
  initialCalendars,
  canManage,
  canDelete,
}: {
  initialDate: Date;
  initialCalendars: CalendarDef[];
  canManage: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const rawParams = useSearchParams();
  const t = useTranslations("calendar.shell");
  const locale = useLocale();
  const rdpLocale = locale === "fr" ? frLocale : enUS;

  // ── URL-driven state ───────────────────────────────────────────────────────
  // Keep a ref so keyboard-shortcut closures always read the latest params
  // without being re-registered on every render.
  const rawParamsRef = useRef(rawParams);
  rawParamsRef.current = rawParams;

  const viewParam = rawParams.get("view");
  const view: CalendarViewType = viewParam === "week" || viewParam === "month" ? viewParam : "day";
  const selectedDate = parseDateParam(rawParams.get("date"), initialDate);
  const focusEventId = rawParams.get("event");

  // On mobile only Day view is supported ; Week/Month collapse to Day while the
  // URL's `?view=` is left untouched, so returning to a wide viewport restores it.
  const isMobile = useIsMobile();
  const effectiveView: CalendarViewType = isMobile && view !== "day" ? "day" : view;

  // ── Internal-only state ────────────────────────────────────────────────────
  const [pendingCreateDefaults, setPendingCreateDefaults] = useState<PendingCreateDefaults | null>(
    null,
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const weekStart = getWeekStart(selectedDate);
  const weekEnd = addDays(weekStart, 6);

  const viewRef = useRef(effectiveView);
  viewRef.current = effectiveView;
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;

  // Single entry-point for all URL mutations — atomically updates any combination
  // of view, date, and event params in one history.replace so the URL is always consistent.
  function navigateTo(updates: { view?: CalendarViewType; date?: Date; event?: string | null }) {
    const params = new URLSearchParams(rawParamsRef.current.toString());
    if (updates.view !== undefined) params.set("view", updates.view);
    if (updates.date !== undefined) params.set("date", formatDateParam(updates.date));
    if ("event" in updates) {
      if (updates.event) params.set("event", updates.event);
      else params.delete("event");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      // ⌘K / Ctrl+K is owned by the app-wide global-search palette
      // (GlobalSearchProvider) ; the calendar no longer binds it to avoid
      // two dialogs firing on the same keypress. The toolbar Search button
      // still opens this page's own event search.
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;
      if (e.key === "d" || e.key === "D") navigateTo({ view: "day" });
      if (e.key === "w" || e.key === "W") navigateTo({ view: "week" });
      if (e.key === "m" || e.key === "M") navigateTo({ view: "month" });
      if (e.key === "t" || e.key === "T") navigateTo({ date: new Date() });
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const v = viewRef.current;
        const d = selectedDateRef.current;
        navigateTo({ date: v === "month" ? addMonths(d, -1) : addDays(d, v === "day" ? -1 : -7) });
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const v = viewRef.current;
        const d = selectedDateRef.current;
        navigateTo({ date: v === "month" ? addMonths(d, 1) : addDays(d, v === "day" ? 1 : 7) });
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── Navigation helpers ─────────────────────────────────────────────────────
  function prev() {
    navigateTo({
      date:
        effectiveView === "month"
          ? addMonths(selectedDate, -1)
          : addDays(selectedDate, effectiveView === "day" ? -1 : -7),
    });
  }
  function next() {
    navigateTo({
      date:
        effectiveView === "month"
          ? addMonths(selectedDate, 1)
          : addDays(selectedDate, effectiveView === "day" ? 1 : 7),
    });
  }
  function goToday() {
    navigateTo({ date: new Date() });
  }

  // ── Date label ─────────────────────────────────────────────────────────────
  const dateLabel =
    effectiveView === "month"
      ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(selectedDate)
      : effectiveView === "day"
        ? new Intl.DateTimeFormat(locale, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          }).format(selectedDate)
        : `${new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(weekStart)} – ${new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(weekEnd)}`;

  const prevLabel =
    effectiveView === "day"
      ? t("prevDay")
      : effectiveView === "week"
        ? t("prevWeek")
        : t("prevMonth");
  const nextLabel =
    effectiveView === "day"
      ? t("nextDay")
      : effectiveView === "week"
        ? t("nextWeek")
        : t("nextMonth");

  const viewIcon =
    effectiveView === "day" ? (
      <CalendarDays className="h-3.5 w-3.5" />
    ) : effectiveView === "week" ? (
      <CalendarRange className="h-3.5 w-3.5" />
    ) : (
      <LayoutGrid className="h-3.5 w-3.5" />
    );

  const viewLabel =
    effectiveView === "day" ? t("day") : effectiveView === "week" ? t("week") : t("month");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TooltipProvider delayDuration={400}>
        <div className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="order-1" onClick={goToday}>
                {t("today")}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("today")} <Kbd>T</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="order-3 md:order-2"
                onClick={prev}
                aria-label={prevLabel}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {prevLabel} <Kbd>←</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="order-4 md:order-3"
                onClick={next}
                aria-label={nextLabel}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {nextLabel} <Kbd>→</Kbd>
            </TooltipContent>
          </Tooltip>
          {isMobile ? (
            // Mobile : the date label is a button that opens a date picker
            // anchored right below it (a popover, not a full-screen modal).
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="order-2 min-w-0 flex-1 justify-start gap-2 font-semibold capitalize"
                >
                  <CalendarDays className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                  <span className="truncate">{dateLabel}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  locale={rdpLocale}
                  weekStartsOn={0}
                  selected={selectedDate}
                  defaultMonth={selectedDate}
                  onSelect={(date) => {
                    if (!date) return;
                    navigateTo({ date, event: null });
                    setDatePickerOpen(false);
                  }}
                  className="p-3"
                />
              </PopoverContent>
            </Popover>
          ) : (
            <span className="order-4 flex-1 truncate pl-1 text-sm font-semibold capitalize text-foreground">
              {dateLabel}
            </span>
          )}

          {/* Only Day view is available on mobile, so the switcher is hidden there. */}
          {!isMobile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="order-5 gap-1.5">
                  {viewIcon}
                  {viewLabel}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={() => navigateTo({ view: "day" })}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {t("day")}
                  <Kbd className="ml-auto">D</Kbd>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigateTo({ view: "week" })}>
                  <CalendarRange className="mr-2 h-4 w-4" />
                  {t("week")}
                  <Kbd className="ml-auto">W</Kbd>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigateTo({ view: "month" })}>
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  {t("month")}
                  <Kbd className="ml-auto">M</Kbd>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </TooltipProvider>

      <div className="min-h-0 flex-1 overflow-hidden">
        {effectiveView === "day" ? (
          <DayView
            initialDate={selectedDate}
            selectedDate={selectedDate}
            onDateChange={(date) => navigateTo({ date, event: null })}
            initialCalendars={initialCalendars}
            canManage={canManage}
            canDelete={canDelete}
            focusEventId={focusEventId}
            onEventFocused={() => navigateTo({ event: null })}
            pendingCreateDefaults={pendingCreateDefaults}
            onPendingCreateConsumed={() => setPendingCreateDefaults(null)}
          />
        ) : effectiveView === "week" ? (
          <WeekView
            initialDate={selectedDate}
            weekStart={weekStart}
            onWeekChange={(date) => navigateTo({ date })}
            onDayClick={(date) => navigateTo({ view: "day", date })}
            initialCalendars={initialCalendars}
            canManage={canManage}
            canDelete={canDelete}
          />
        ) : (
          <MonthView
            selectedDate={selectedDate}
            onDayClick={(date) => navigateTo({ view: "day", date })}
            initialCalendars={initialCalendars}
            canManage={canManage}
            canDelete={canDelete}
          />
        )}
      </div>

    </div>
  );
}
