"use client";

import { useEffect, useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  nextFireTime,
  type AutomationSchedule,
  type TimeOfDay,
} from "@monark/automation/contracts";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ── local ⇄ UTC (the backend stores/computes in UTC ; the builder works local) ──
// getTimezoneOffset() = minutes to ADD to a local wall-clock to reach UTC.
function offsetMin(): number {
  return new Date().getTimezoneOffset();
}
/** Shift a time-of-day by `deltaMin`, returning the new time + the day carry. */
function shiftTime(time: TimeOfDay, deltaMin: number): { time: TimeOfDay; dayDelta: number } {
  const total = time.hour * 60 + time.minute + deltaMin;
  const dayDelta = Math.floor(total / 1440);
  const wrapped = ((total % 1440) + 1440) % 1440;
  return { time: { hour: Math.floor(wrapped / 60), minute: wrapped % 60 }, dayDelta };
}
const rollWeekday = (wd: number, delta: number): number => (((wd + delta) % 7) + 7) % 7;

/** Convert a stored (UTC) schedule to the local view the builder edits. */
function toLocal(s: AutomationSchedule): AutomationSchedule {
  if (s.kind === "interval") return s;
  const { time, dayDelta } = shiftTime(s.time, -offsetMin());
  if (s.kind === "weekly")
    return { ...s, time, weekdays: s.weekdays.map((w) => rollWeekday(w, dayDelta)) };
  if (s.kind === "monthly-nth-weekday")
    return { ...s, time, weekday: rollWeekday(s.weekday, dayDelta) };
  return { ...s, time }; // daily / monthly-day : time only
}
/** Convert the local view back to the stored (UTC) schedule. */
function toUtc(s: AutomationSchedule): AutomationSchedule {
  if (s.kind === "interval") return s;
  const { time, dayDelta } = shiftTime(s.time, offsetMin());
  if (s.kind === "weekly")
    return { ...s, time, weekdays: s.weekdays.map((w) => rollWeekday(w, dayDelta)) };
  if (s.kind === "monthly-nth-weekday")
    return { ...s, time, weekday: rollWeekday(s.weekday, dayDelta) };
  return { ...s, time };
}

function todayAnchor(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function timeToInput(t: TimeOfDay): string {
  return `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
}
function inputToTime(v: string): TimeOfDay {
  const [h, m] = v.split(":").map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

const DEFAULT_TIME: TimeOfDay = { hour: 9, minute: 0 };
type Kind = AutomationSchedule["kind"];

/** A fresh local schedule of the given kind, seeded with sensible defaults. */
function blankLocal(kind: Kind): AutomationSchedule {
  switch (kind) {
    case "interval":
      return { kind, everyMinutes: 20 };
    case "daily":
      return { kind, time: DEFAULT_TIME, everyDays: 1, anchor: todayAnchor() };
    case "weekly":
      return { kind, time: DEFAULT_TIME, weekdays: [1], everyWeeks: 1, anchor: todayAnchor() };
    case "monthly-day":
      return { kind, time: DEFAULT_TIME, day: 1 };
    case "monthly-nth-weekday":
      return { kind, time: DEFAULT_TIME, nth: 2, weekday: 3 };
  }
}

const KINDS: Kind[] = ["interval", "daily", "weekly", "monthly-day", "monthly-nth-weekday"];
const NTHS = [1, 2, 3, 4, -1] as const;

/**
 * The Scheduled Trigger's cron-like schedule editor. The builder works entirely
 * in the viewer's local timezone (kind picker + kind-specific controls + a live
 * "next run" preview) ; {@link toUtc} / {@link toLocal} translate at the storage
 * boundary since the backend runs on UTC. Emits a full {@link AutomationSchedule}
 * on every change.
 */
export function ScheduleBuilder({
  value,
  disabled,
  onChange,
}: {
  value: AutomationSchedule | undefined;
  disabled?: boolean;
  onChange: (schedule: AutomationSchedule) => void;
}) {
  const t = useTranslations("automation.editor.schedule");
  const format = useFormatter();

  // Localized short weekday names indexed by UTC weekday (0 = Sun … 6 = Sat).
  const weekdayNames = useMemo(() => {
    const names = new Array<string>(7);
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.UTC(2024, 0, 7 + i));
      names[d.getUTCDay()] = format.dateTime(d, { weekday: "short", timeZone: "UTC" });
    }
    return names;
  }, [format]);
  // Weekday order for chips : Mon-first, wrapping Sunday to the end.
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];

  // Seed a default when the node is fresh (no schedule yet).
  useEffect(() => {
    if (!value) onChange(toUtc(blankLocal("daily")));
  }, [value, onChange]);

  const local = value ? toLocal(value) : blankLocal("daily");
  const emit = (next: AutomationSchedule) => onChange(toUtc(next));

  // Next run, in the viewer's local time.
  const nextRun = value ? nextFireTime(value, new Date()) : null;

  const rowClass = "flex flex-wrap items-center gap-2 text-sm";

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      {/* Kind picker. */}
      <Select
        value={local.kind}
        disabled={disabled}
        onValueChange={(k) => emit(blankLocal(k as Kind))}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {KINDS.map((k) => (
            <SelectItem key={k} value={k}>
              {t(`kind.${k}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {local.kind === "interval" && (
        <div className={rowClass}>
          <span>{t("every")}</span>
          <Input
            type="number"
            min={1}
            max={1440}
            disabled={disabled}
            className="w-20"
            value={String(local.everyMinutes)}
            onChange={(e) =>
              emit({ ...local, everyMinutes: Math.max(1, Number(e.target.value) || 1) })
            }
          />
          <span>{t("minutes")}</span>
        </div>
      )}

      {local.kind === "daily" && (
        <div className={rowClass}>
          <span>{t("every")}</span>
          <Input
            type="number"
            min={1}
            max={366}
            disabled={disabled}
            className="w-20"
            value={String(local.everyDays)}
            onChange={(e) =>
              emit({ ...local, everyDays: Math.max(1, Number(e.target.value) || 1) })
            }
          />
          <span>{t("days")}</span>
          <span>{t("at")}</span>
          <TimeField
            time={local.time}
            disabled={disabled}
            onChange={(time) => emit({ ...local, time })}
          />
        </div>
      )}

      {local.kind === "weekly" && (
        <div className="space-y-2">
          <div className={rowClass}>
            <span>{t("every")}</span>
            <Input
              type="number"
              min={1}
              max={52}
              disabled={disabled}
              className="w-20"
              value={String(local.everyWeeks)}
              onChange={(e) =>
                emit({ ...local, everyWeeks: Math.max(1, Number(e.target.value) || 1) })
              }
            />
            <span>{t("weeks")}</span>
            <span>{t("at")}</span>
            <TimeField
              time={local.time}
              disabled={disabled}
              onChange={(time) => emit({ ...local, time })}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {weekdayOrder.map((wd) => {
              const on = local.weekdays.includes(wd);
              return (
                <button
                  key={wd}
                  type="button"
                  disabled={disabled}
                  aria-pressed={on}
                  onClick={() => {
                    const next = on
                      ? local.weekdays.filter((w) => w !== wd)
                      : [...local.weekdays, wd];
                    if (next.length > 0) emit({ ...local, weekdays: next });
                  }}
                  className={cn(
                    "h-8 w-9 rounded-md border text-xs font-medium transition disabled:opacity-50",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  {weekdayNames[wd]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {local.kind === "monthly-day" && (
        <div className={rowClass}>
          <span>{t("onDay")}</span>
          <Select
            value={String(local.day)}
            disabled={disabled}
            onValueChange={(v) => emit({ ...local, day: Number(v) })}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}
                </SelectItem>
              ))}
              <SelectItem value="-1">{t("lastDay")}</SelectItem>
            </SelectContent>
          </Select>
          <span>{t("at")}</span>
          <TimeField
            time={local.time}
            disabled={disabled}
            onChange={(time) => emit({ ...local, time })}
          />
        </div>
      )}

      {local.kind === "monthly-nth-weekday" && (
        <div className={rowClass}>
          <span>{t("onThe")}</span>
          <Select
            value={String(local.nth)}
            disabled={disabled}
            onValueChange={(v) => emit({ ...local, nth: Number(v) as (typeof NTHS)[number] })}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NTHS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t(`nth.${n === -1 ? "last" : n}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(local.weekday)}
            disabled={disabled}
            onValueChange={(v) => emit({ ...local, weekday: Number(v) })}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weekdayOrder.map((wd) => (
                <SelectItem key={wd} value={String(wd)}>
                  {weekdayNames[wd]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>{t("at")}</span>
          <TimeField
            time={local.time}
            disabled={disabled}
            onChange={(time) => emit({ ...local, time })}
          />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {nextRun
          ? t("nextRun", {
              time: format.dateTime(nextRun, { dateStyle: "medium", timeStyle: "short" }),
            })
          : t("nextRunNone")}
      </p>
    </div>
  );
}

function TimeField({
  time,
  disabled,
  onChange,
}: {
  time: TimeOfDay;
  disabled?: boolean;
  onChange: (time: TimeOfDay) => void;
}) {
  return (
    <Input
      type="time"
      disabled={disabled}
      className="w-28"
      value={timeToInput(time)}
      onChange={(e) => e.target.value && onChange(inputToTime(e.target.value))}
    />
  );
}
