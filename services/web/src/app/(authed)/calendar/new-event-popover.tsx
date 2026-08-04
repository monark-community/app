"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fr as frLocale, enUS } from "react-day-picker/locale";
import { CalendarIcon, Plus, X } from "lucide-react";
import type {
  CalendarDef,
  CalendarEvent,
  CalendarEventTime,
  CalendarEventType,
} from "@monark/calendar/contracts";
import { ConfirmDialog, FormActionsFooter } from "@/components/patterns";
import { RichTextEditor, useFieldStrings } from "@/components/fields";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/use-is-mobile";

// ── Helpers ────────────────────────────────────────────────────────────────────

type ReminderUnit = "minutes" | "hours" | "days" | "weeks";
type ReminderRow = { qty: number; unit: ReminderUnit };

const UNIT_MULTIPLIER: Record<ReminderUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
  weeks: 10080,
};

function reminderRowToMinutes(row: ReminderRow): number {
  return row.qty * UNIT_MULTIPLIER[row.unit];
}

function minutesToReminderRow(m: number): ReminderRow {
  if (m >= 10080 && m % 10080 === 0) return { qty: m / 10080, unit: "weeks" };
  if (m >= 1440 && m % 1440 === 0) return { qty: m / 1440, unit: "days" };
  if (m >= 60 && m % 60 === 0) return { qty: m / 60, unit: "hours" };
  return { qty: m, unit: "minutes" };
}

type FormState = {
  calendarId: string;
  eventType: CalendarEventType;
  title: string;
  startDate: string; // YYYY-MM-DD; drives ALL_DAY startAt; shown read-only for other types
  startTime: string;
  endTime: string;
  endDate: string; // YYYY-MM-DD; drives ALL_DAY endAt
  description: string;
  location: string;
  participants: string[];
  reminders: ReminderRow[];
};

function dateToTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function timeStringToDate(base: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  // noon avoids DST edge cases
  return new Date(y!, (m ?? 1) - 1, d!, 12, 0, 0, 0);
}

function formatDateStr(s: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parseDateStr(s));
}

function addMinutesToTimeString(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ── Inline date picker ─────────────────────────────────────────────────────────

function DatePickerField({
  id,
  value,
  locale,
  rdpLocale,
  fromDate,
  onChange,
}: {
  id: string;
  value: string;
  locale: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rdpLocale: any;
  fromDate?: Date;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDateStr(value);

  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-left capitalize">{formatDateStr(value, locale)}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
          <div className="capitalize">
            <Calendar
              mode="single"
              selected={selected}
              locale={rdpLocale}
              fromDate={fromDate}
              onSelect={(d) => {
                if (d) {
                  onChange(toDateInputValue(d));
                  setOpen(false);
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Member avatar ──────────────────────────────────────────────────────────────

function MemberAvatar({
  displayName,
  email,
  avatarUrl,
  size = "sm",
}: {
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
  size?: "xs" | "sm";
}) {
  const dim = size === "xs" ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[10px]";
  const initials = (displayName ?? email).slice(0, 2).toUpperCase();
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-medium ${dim}`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={displayName ?? email} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

// ── Public types ───────────────────────────────────────────────────────────────

export type NewEventSubmitPayload = {
  calendarId: string;
  eventType: CalendarEventType;
  startAt: Date;
  endAt: Date;
  title: string;
  description?: string;
  location?: string;
  participants?: string[];
  reminders?: number[];
};

// ── Component ──────────────────────────────────────────────────────────────────

export function NewEventPopover({
  open,
  anchorX,
  anchorY,
  side = "right",
  mode,
  startTime,
  selectedDate,
  existingEvent,
  calendars,
  defaultCalendarId,
  initialEventType,
  endDateOverride,
  onCancel,
  onSubmit,
  onUpdate,
  onDelete,
  onTimeChange,
  onTypeChange,
  onCalendarChange,
  onDateChange,
  onDismiss,
}: {
  open: boolean;
  anchorX: number;
  anchorY: number;
  side?: "left" | "right";
  mode: "create" | "edit";
  startTime?: CalendarEventTime;
  selectedDate: Date;
  existingEvent?: CalendarEvent;
  calendars: CalendarDef[];
  defaultCalendarId?: string;
  // Create mode only : preset the event type (e.g. a multi-day drag seeds
  // ALL_DAY) and/or the end date, instead of defaulting both from
  // `selectedDate`/"STANDARD".
  initialEventType?: CalendarEventType;
  endDateOverride?: Date;
  onCancel: () => void;
  onSubmit: (payload: NewEventSubmitPayload) => Promise<void>;
  onUpdate?: (eventId: string, patch: Partial<NewEventSubmitPayload>) => Promise<void>;
  onDelete?: (eventId: string) => Promise<void>;
  onTimeChange?: (start: CalendarEventTime, end: CalendarEventTime) => void;
  onTypeChange?: (type: CalendarEventType) => void;
  onCalendarChange?: (calendarId: string) => void;
  onDateChange?: (date: Date) => void;
  onDismiss?: () => void;
}) {
  const tc = useTranslations("calendar.dayView.newEvent");
  const te = useTranslations("calendar.dayView.editEvent");
  const fieldStrings = useFieldStrings();
  const isMobile = useIsMobile();
  const locale = useLocale();
  const rdpLocale = locale === "fr" ? frLocale : enUS;
  const titleRef = useRef<HTMLInputElement>(null);
  const participantInputRef = useRef<HTMLInputElement>(null);

  const defaultCalId = defaultCalendarId ?? calendars[0]?.id ?? "";

  const meQuery = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const meLabel = meQuery.data ? (meQuery.data.displayName ?? meQuery.data.email ?? null) : null;

  function buildDefaultForm(): FormState {
    const baseDateStr = toDateInputValue(selectedDate);
    if (mode === "edit" && existingEvent) {
      const startDateStr = toDateInputValue(existingEvent.startAt);
      const endDateStr =
        existingEvent.eventType === "ALL_DAY"
          ? toDateInputValue(new Date(existingEvent.endAt.getTime() - 1))
          : startDateStr;
      return {
        calendarId: existingEvent.calendarId,
        eventType: existingEvent.eventType ?? "STANDARD",
        title: existingEvent.title,
        startDate: startDateStr,
        startTime: dateToTimeString(existingEvent.startAt),
        endTime: dateToTimeString(existingEvent.endAt),
        endDate: endDateStr,
        description: existingEvent.description ?? "",
        location: existingEvent.location ?? "",
        participants: existingEvent.participants ?? [],
        reminders: (existingEvent.reminders ?? []).map(minutesToReminderRow),
      };
    }
    const startStr = startTime
      ? `${String(startTime.hour).padStart(2, "0")}:${String(startTime.minute).padStart(2, "0")}`
      : "09:00";
    return {
      calendarId: defaultCalId,
      eventType: initialEventType ?? "STANDARD",
      title: "",
      startDate: baseDateStr,
      startTime: startStr,
      endTime: addMinutesToTimeString(startStr, 60),
      endDate: endDateOverride ? toDateInputValue(endDateOverride) : baseDateStr,
      description: "",
      location: "",
      participants: meLabel ? [meLabel] : [],
      reminders: [],
    };
  }

  const [form, setForm] = useState<FormState>(buildDefaultForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [participantInput, setParticipantInput] = useState("");
  const [participantDropdownOpen, setParticipantDropdownOpen] = useState(false);
  // `useIsMobile` resolves to false on the first (pre-effect) render. Wait for
  // mount so we pick the Popover vs full-screen Dialog wrapper once, correctly —
  // otherwise mobile would flash the anchored popover (and focus the title) first.
  const [mounted, setMounted] = useState(false);

  const initialFormRef = useRef<FormState | null>(null);

  // Sync when the popover re-opens with different data
  const prevKey = useRef("");
  const newKey =
    mode === "edit"
      ? (existingEvent?.id ?? "")
      : startTime
        ? `${startTime.hour}:${startTime.minute}`
        : "";
  if (open && prevKey.current !== newKey) {
    prevKey.current = newKey;
    const newForm = buildDefaultForm();
    setForm(newForm);
    initialFormRef.current = newForm;
    setFormError(null);
    setIsConfirmingDelete(false);
  }
  if (initialFormRef.current === null) {
    initialFormRef.current = form;
  }

  // If me data loads after first mount, inject current user into an empty create form
  useEffect(() => {
    if (!open || mode !== "create" || !meLabel) return;
    setForm((f) => (f.participants.length === 0 ? { ...f, participants: [meLabel] } : f));
  }, [meLabel]);

  useEffect(() => setMounted(true), []);

  const calendarMap = useMemo(
    () => Object.fromEntries(calendars.map((c) => [c.id, c])),
    [calendars],
  );

  const membersQuery = trpc.calendar.calendars.members.useQuery(
    { calendarId: form.calendarId },
    { enabled: !!form.calendarId },
  );
  const members = membersQuery.data ?? [];

  const filteredMembers = members.filter((m) => {
    const label = m.displayName ?? m.email;
    return (
      label.toLowerCase().includes(participantInput.toLowerCase()) &&
      !form.participants.includes(label)
    );
  });

  const memberByLabel = useMemo(() => {
    const map = new Map<string, (typeof members)[0]>();
    for (const m of members) {
      map.set(m.displayName ?? m.email, m);
    }
    return map;
  }, [members]);

  function set(field: keyof FormState, value: string) {
    setFormError(null);
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setParticipants(next: string[]) {
    setFormError(null);
    setForm((f) => ({ ...f, participants: next }));
  }

  function addReminderRow() {
    setForm((f) => ({
      ...f,
      reminders: [...f.reminders, { qty: 30, unit: "minutes" as ReminderUnit }],
    }));
  }

  function updateReminderRow(idx: number, field: "qty" | "unit", value: number | ReminderUnit) {
    setForm((f) => {
      const rows = [...f.reminders];
      rows[idx] = { ...rows[idx]!, [field]: value };
      return { ...f, reminders: rows };
    });
  }

  function removeReminderRow(idx: number) {
    setForm((f) => ({ ...f, reminders: f.reminders.filter((_, i) => i !== idx) }));
  }

  function addParticipant(label: string) {
    if (!form.participants.includes(label)) {
      setParticipants([...form.participants, label]);
    }
    setParticipantInput("");
  }

  function isDirty(): boolean {
    return JSON.stringify(form) !== JSON.stringify(initialFormRef.current);
  }

  function handleCancel() {
    if (isDirty()) {
      setConfirmDiscard(true);
      return;
    }
    onCancel();
  }

  function handleTypeChange(newType: CalendarEventType) {
    setForm((f) => ({
      ...f,
      eventType: newType,
      // ensure dates are populated when switching to/from ALL_DAY
      startDate: f.startDate || toDateInputValue(selectedDate),
      endDate: f.endDate || toDateInputValue(selectedDate),
    }));
    onTypeChange?.(newType);
  }

  function computeDateRange(f: FormState): { startAt: Date; endAt: Date } {
    if (f.eventType === "ALL_DAY") {
      const [sy, sm, sd] = (f.startDate || toDateInputValue(selectedDate)).split("-").map(Number);
      const startAt = new Date(sy!, (sm ?? 1) - 1, sd!, 0, 0, 0, 0);
      const [ey, em, ed] = (f.endDate || f.startDate || toDateInputValue(selectedDate))
        .split("-")
        .map(Number);
      const lastDay = new Date(ey!, (em ?? 1) - 1, ed!, 0, 0, 0, 0);
      const endAt =
        lastDay >= startAt
          ? new Date(lastDay.getTime() + 24 * 60 * 60 * 1000)
          : new Date(startAt.getTime() + 24 * 60 * 60 * 1000);
      return { startAt, endAt };
    }
    if (f.eventType === "PUNCTUAL") {
      const dateBase = parseDateStr(f.startDate || toDateInputValue(selectedDate));
      const startAt = timeStringToDate(dateBase, f.startTime);
      return { startAt, endAt: new Date(startAt) };
    }
    const dateBase = parseDateStr(f.startDate || toDateInputValue(selectedDate));
    const startAt = timeStringToDate(dateBase, f.startTime);
    const endAt = timeStringToDate(dateBase, f.endTime);
    return { startAt, endAt };
  }

  function buildPayload(): NewEventSubmitPayload | null {
    if (!form.title.trim()) {
      titleRef.current?.focus();
      return null;
    }

    const { startAt, endAt } = computeDateRange(form);

    return {
      calendarId: form.calendarId,
      eventType: form.eventType,
      startAt,
      endAt,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      location: form.location.trim() || undefined,
      participants: form.participants.length > 0 ? form.participants : undefined,
      reminders:
        form.reminders.length > 0
          ? [...new Set(form.reminders.map(reminderRowToMinutes))]
          : undefined,
    };
  }

  // ── Conflict detection ─────────────────────────────────────
  // Debounced so a same-calendar overlap check doesn't fire on every
  // keystroke-equivalent field change ; non-blocking, purely informational.
  const dateRange = computeDateRange(form);
  const [debouncedRange, setDebouncedRange] = useState(dateRange);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRange(dateRange), 400);
    return () => clearTimeout(timer);
  }, [dateRange.startAt.getTime(), dateRange.endAt.getTime(), form.calendarId]);

  const conflictsQuery = trpc.calendar.events.checkConflicts.useQuery(
    {
      calendarId: form.calendarId,
      startAt: debouncedRange.startAt.toISOString(),
      endAt: debouncedRange.endAt.toISOString(),
      excludeEventId: mode === "edit" ? existingEvent?.id : undefined,
    },
    {
      enabled: open && !!form.calendarId && debouncedRange.endAt > debouncedRange.startAt,
      refetchOnWindowFocus: false,
    },
  );
  const conflicts = conflictsQuery.data ?? [];

  async function handleSubmit() {
    const payload = buildPayload();
    if (!payload) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      if (mode === "edit" && existingEvent && onUpdate) {
        await onUpdate(existingEvent.id, payload);
      } else {
        await onSubmit(payload);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Both breakpoints pair the FormActionsFooter delete with a ConfirmDialog
  // that calls performDelete once confirmed.
  async function performDelete() {
    setIsConfirmingDelete(false);
    if (!existingEvent || !onDelete) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await onDelete(existingEvent.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isEdit = mode === "edit";
  const heading = isEdit ? te("heading") : tc("heading");
  const submitLabel = isEdit ? te("save") : tc("create");
  const showStartTime = form.eventType !== "ALL_DAY";
  const showEndTime = form.eventType === "STANDARD";
  const showAllDayDates = form.eventType === "ALL_DAY";

  // Defer the first paint by one frame so the wrapper (Popover vs Dialog) is
  // chosen from a settled `isMobile`. This component only mounts on a user tap,
  // so there is no meaningful SSR output to preserve.
  if (!mounted) return null;

  const formBody = (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1.15fr] md:gap-x-4 md:gap-y-3">
        {/* Event type — first field on mobile (where the two columns collapse
            into one stacked column), pinned to the top of the right column on
            desktop. Leading with it matters: the type decides which fields
            appear below (times vs all-day dates). */}
        <div className="flex flex-col gap-1 [&_label]:whitespace-nowrap md:col-start-2 md:row-start-1">
          <Label>{tc("eventTypeLabel")}</Label>
          <div className="flex h-9 rounded-md border border-input">
            {(["STANDARD", "PUNCTUAL", "ALL_DAY"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={cn(
                  "flex flex-1 items-center justify-center border-l border-input px-2 text-xs font-medium transition-colors first:rounded-l-md first:border-l-0 last:rounded-r-md",
                  form.eventType === type
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                {type === "STANDARD"
                  ? tc("eventTypeStandard")
                  : type === "PUNCTUAL"
                    ? tc("eventTypePunctual")
                    : tc("eventTypeAllDay")}
              </button>
            ))}
          </div>
        </div>

        {/* Left column: title + description */}
        <div className="flex min-h-0 flex-col gap-3 md:col-start-1 md:row-start-1 md:row-span-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="cal-title">{tc("titleLabel")}</Label>
            <Input
              id="cal-title"
              ref={titleRef}
              placeholder={tc("titlePlaceholder")}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1">
            <Label htmlFor="cal-desc">{tc("descriptionLabel")}</Label>
            <RichTextEditor
              id="cal-desc"
              ariaLabel={tc("descriptionLabel")}
              placeholder={tc("descriptionPlaceholder")}
              labels={fieldStrings.labels.richText}
              minHeight={28}
              // Desktop: fill the (grid-stretched) left column so the editor is
              // as tall as the metadata column. Mobile: keep the min-height so
              // the form scrolls naturally in the full-screen dialog.
              fill={!isMobile}
              value={form.description}
              onChange={(html) => set("description", html)}
            />
          </div>
        </div>

        {/* Right column: metadata — Date, Times, Participants, Location,
            Calendar, Reminders (top → bottom). Type is rendered above (moved
            out so it can lead on mobile) and pinned back to the top of this
            column on desktop via grid placement. */}
        <div className="flex flex-col gap-3 [&_label]:whitespace-nowrap md:col-start-2 md:row-start-2">
          {/* Non-ALL_DAY: editable date picker so user can move the event to a different day */}
          {!showAllDayDates && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="cal-event-date">{tc("dateLabel")}</Label>
              <DatePickerField
                id="cal-event-date"
                value={form.startDate}
                locale={locale}
                rdpLocale={rdpLocale}
                onChange={(v) => {
                  set("startDate", v);
                  set("endDate", v);
                  onDateChange?.(parseDateStr(v));
                }}
              />
            </div>
          )}

          {/* ALL_DAY: editable start + end date pickers */}
          {showAllDayDates && (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cal-start-date">{tc("startDateLabel")}</Label>
                <DatePickerField
                  id="cal-start-date"
                  value={form.startDate}
                  locale={locale}
                  rdpLocale={rdpLocale}
                  onChange={(v) => {
                    set("startDate", v);
                    if (form.endDate < v) set("endDate", v);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cal-end-date">{tc("endDateLabel")}</Label>
                <DatePickerField
                  id="cal-end-date"
                  value={form.endDate}
                  locale={locale}
                  rdpLocale={rdpLocale}
                  fromDate={parseDateStr(form.startDate)}
                  onChange={(v) => set("endDate", v)}
                />
              </div>
            </>
          )}

          {/* Times */}
          {(showStartTime || showEndTime) && (
            <div className="flex gap-2">
              {showStartTime && (
                <div className="flex flex-1 flex-col gap-1">
                  <Label>{tc("startTimeLabel")}</Label>
                  <TimePicker
                    value={form.startTime}
                    onChange={(val) => {
                      set("startTime", val);
                      const [sh, sm] = val.split(":").map(Number);
                      const [eh, em] = form.endTime.split(":").map(Number);
                      onTimeChange?.(
                        { hour: sh ?? 0, minute: sm ?? 0 },
                        { hour: eh ?? 0, minute: em ?? 0 },
                      );
                    }}
                  />
                </div>
              )}
              {showEndTime && (
                <div className="flex flex-1 flex-col gap-1">
                  <Label>{tc("endTimeLabel")}</Label>
                  <TimePicker
                    value={form.endTime}
                    onChange={(val) => {
                      set("endTime", val);
                      const [sh, sm] = form.startTime.split(":").map(Number);
                      const [eh, em] = val.split(":").map(Number);
                      onTimeChange?.(
                        { hour: sh ?? 0, minute: sm ?? 0 },
                        { hour: eh ?? 0, minute: em ?? 0 },
                      );
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Participants — tag-style multi-select */}
          <div className="flex flex-col gap-1">
            <Label htmlFor="cal-participants">{tc("participantsLabel")}</Label>
            <div className="relative">
              <div
                className="flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm focus-within:ring-1 focus-within:ring-ring"
                onClick={() => participantInputRef.current?.focus()}
              >
                {form.participants.map((p) => {
                  const member = memberByLabel.get(p);
                  return (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-1 pr-1.5 text-xs font-medium"
                    >
                      {member && (
                        <MemberAvatar
                          displayName={member.displayName}
                          email={member.email}
                          avatarUrl={member.avatarUrl}
                          size="xs"
                        />
                      )}
                      {p}
                      <button
                        type="button"
                        aria-label={`Remove ${p}`}
                        className="flex items-center text-muted-foreground hover:text-foreground"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setParticipants(form.participants.filter((x) => x !== p));
                        }}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
                <input
                  id="cal-participants"
                  ref={participantInputRef}
                  value={participantInput}
                  onChange={(e) => setParticipantInput(e.target.value)}
                  onFocus={() => setParticipantDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setParticipantDropdownOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && participantInput.trim()) {
                      e.preventDefault();
                      addParticipant(participantInput.trim());
                    } else if (
                      e.key === "Backspace" &&
                      !participantInput &&
                      form.participants.length > 0
                    ) {
                      setParticipants(form.participants.slice(0, -1));
                    }
                  }}
                  placeholder={form.participants.length === 0 ? tc("participantsPlaceholder") : ""}
                  className="min-w-20 flex-1 bg-transparent py-0.5 outline-none"
                />
              </div>
              {participantDropdownOpen && filteredMembers.length > 0 && (
                <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
                  {filteredMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addParticipant(m.displayName ?? m.email);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <MemberAvatar
                        displayName={m.displayName}
                        email={m.email}
                        avatarUrl={m.avatarUrl}
                        size="sm"
                      />
                      <span className="font-medium">{m.displayName ?? m.email}</span>
                      {m.displayName && (
                        <span className="text-xs text-muted-foreground">{m.email}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="cal-location">{tc("locationLabel")}</Label>
            <Input
              id="cal-location"
              placeholder={tc("locationPlaceholder")}
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
            />
          </div>

          {calendars.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="cal-calendar">{tc("calendarLabel")}</Label>
              <Select
                value={form.calendarId}
                onValueChange={(v) => {
                  set("calendarId", v);
                  onCalendarChange?.(v);
                }}
              >
                <SelectTrigger id="cal-calendar">
                  <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${!calendarMap[form.calendarId]?.color ? "bg-primary" : ""}`}
                      style={
                        calendarMap[form.calendarId]?.color
                          ? { backgroundColor: calendarMap[form.calendarId]!.color! }
                          : {}
                      }
                    />
                    <span className="truncate">{calendarMap[form.calendarId]?.name ?? ""}</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {calendars.map((cal) => (
                    <SelectItem key={cal.id} value={cal.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${!cal.color ? "bg-primary" : ""}`}
                          style={cal.color ? { backgroundColor: cal.color } : {}}
                        />
                        {cal.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label>{tc("remindersLabel")}</Label>
            <div className="flex flex-col gap-1.5">
              {form.reminders.map((row, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    value={row.qty}
                    onChange={(e) =>
                      updateReminderRow(idx, "qty", Math.max(1, parseInt(e.target.value) || 1))
                    }
                    className="h-9 w-16 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <Select
                    value={row.unit}
                    onValueChange={(v) => updateReminderRow(idx, "unit", v as ReminderUnit)}
                  >
                    <SelectTrigger className="min-w-0 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">{tc("reminderUnitMinutes")}</SelectItem>
                      <SelectItem value="hours">{tc("reminderUnitHours")}</SelectItem>
                      <SelectItem value="days">{tc("reminderUnitDays")}</SelectItem>
                      <SelectItem value="weeks">{tc("reminderUnitWeeks")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {tc("reminderBefore")}
                  </span>
                  <TooltipProvider delayDuration={400}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={tc("removeReminder")}
                          onClick={() => removeReminderRow(idx)}
                          className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">{tc("removeReminder")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              ))}
              <button
                type="button"
                onClick={addReminderRow}
                className="flex items-center gap-1 self-start rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                {tc("addReminder")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {conflicts.length > 0 && (
        <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          {conflicts.length === 1
            ? tc("conflictWarningOne", { title: conflicts[0]!.title })
            : tc("conflictWarningMore", {
                title: conflicts[0]!.title,
                count: conflicts.length - 1,
              })}
        </p>
      )}

      {formError && <p className="mt-3 text-xs text-destructive">{formError}</p>}
    </>
  );

  // Delete + discard confirmations, shared by the mobile and desktop
  // branches so both breakpoints use the same ConfirmDialog + footer.
  const confirmDialogs = (
    <>
      <ConfirmDialog
        open={isConfirmingDelete}
        onOpenChange={setIsConfirmingDelete}
        title={te("deleteConfirmLabel")}
        cancelLabel={tc("cancel")}
        confirmLabel={te("delete")}
        isPending={isSubmitting}
        onConfirm={performDelete}
      />
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={tc("discardTitle")}
        description={tc("discardConfirm")}
        cancelLabel={tc("cancel")}
        confirmLabel={tc("discardCta")}
        confirmVariant="default"
        onConfirm={() => {
          setConfirmDiscard(false);
          onCancel();
        }}
      />
    </>
  );

  // Mobile: a full-screen modal makes far better use of the phone viewport than an
  // anchored popover, and sidesteps positioning the popover near a tap coordinate.
  if (isMobile) {
    return (
      <>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            if (!v) handleCancel();
          }}
        >
          <DialogContent
            mobileFullScreen
            onOpenAutoFocus={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => {
              e.preventDefault();
              handleCancel();
            }}
          >
            <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12 text-left">
              <DialogTitle className="text-base">{heading}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto p-4">{formBody}</div>
              <FormActionsFooter
                submitLabel={isSubmitting ? "…" : submitLabel}
                cancelLabel={tc("cancel")}
                onCancel={handleCancel}
                isBusy={isSubmitting}
                onDelete={isEdit ? () => setIsConfirmingDelete(true) : undefined}
                deleteLabel={te("delete")}
                className="shrink-0 border-t border-border px-4 py-3"
              />
            </form>
          </DialogContent>
        </Dialog>
        {confirmDialogs}
      </>
    );
  }

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <div
          className="pointer-events-none fixed"
          style={{ left: anchorX, top: anchorY, width: 0, height: 0 }}
          aria-hidden
        />
      </PopoverAnchor>
      <PopoverContent
        // Cap the box at the viewport and scroll the body inside, so a long
        // description / many reminders can't grow the popover past the screen.
        className="flex max-h-[calc(100dvh-2rem)] w-190 max-w-[95vw] flex-col overflow-hidden p-0"
        side={side}
        align="start"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          titleRef.current?.focus();
        }}
        onPointerDownOutside={onDismiss ?? onCancel}
        onFocusOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          handleCancel();
        }}
      >
        <p className="shrink-0 px-4 pb-3 pt-4 text-sm font-semibold text-foreground">{heading}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-4">{formBody}</div>
          <FormActionsFooter
            submitLabel={isSubmitting ? "…" : submitLabel}
            cancelLabel={tc("cancel")}
            onCancel={handleCancel}
            isBusy={isSubmitting}
            onDelete={isEdit ? () => setIsConfirmingDelete(true) : undefined}
            deleteLabel={te("delete")}
            className="shrink-0 px-4 pb-4 pt-3"
          />
        </form>
        {confirmDialogs}
      </PopoverContent>
    </Popover>
  );
}
