"use client";

import { HOUR_HEIGHT_PX } from "../constants";
import { formatHourLabel, type TimeFormat } from "../date-utils";
import { DayDateHeader } from "./day-date-header";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function DayTimeline({
  date,
  headerHeight,
  hideHeader,
  timeFormat = "24h",
  workingHours,
}: {
  date: Date;
  headerHeight?: number;
  hideHeader?: boolean;
  timeFormat?: TimeFormat;
  workingHours?: { enabled: boolean; startHour: number; endHour: number };
}) {
  return (
    <div className="flex w-12 shrink-0 flex-col border-r border-border md:w-16">
      {!hideHeader && (
        <div
          style={{ height: headerHeight }}
          className="flex shrink-0 items-end justify-center border-b border-border pb-1"
        >
          <DayDateHeader date={date} />
        </div>
      )}
      <div className="relative">
        {HOURS.map((h) => {
          const isOffHours =
            workingHours?.enabled && (h < workingHours.startHour || h >= workingHours.endHour);
          return (
            <div
              key={h}
              style={{ height: HOUR_HEIGHT_PX }}
              className="flex items-start justify-end pr-2 pt-1"
            >
              <span
                className={`text-[10px] tabular-nums text-muted-foreground${isOffHours ? " opacity-40" : ""}`}
              >
                {formatHourLabel(h, timeFormat)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
