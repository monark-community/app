"use client";

import type { CalendarEvent, CalendarEventTime, ColumnDef } from "../../contracts/types";
import { HOUR_HEIGHT_PX, TOTAL_HEIGHT_PX } from "../constants";
import { CurrentTimeIndicator } from "./current-time-indicator";
import { DayColumn } from "./day-column";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function snapToQuarter(rawMinutes: number): CalendarEventTime {
  const clamped = Math.max(0, Math.min(rawMinutes, 24 * 60 - 15));
  const snapped = Math.round(clamped / 15) * 15;
  return { hour: Math.floor(snapped / 60) % 24, minute: snapped % 60 };
}

export function DayColumnsArea({
  columns,
  eventsMap,
  selectedEventId,
  pendingEditEventId,
  hideHeader,
  onSlotClick,
  onEventClick,
  onDragStart,
}: {
  columns: ColumnDef[];
  eventsMap: Record<string, CalendarEvent[]>;
  selectedEventId?: string | null;
  pendingEditEventId?: string | null;
  hideHeader?: boolean;
  onSlotClick: (
    columnId: string,
    time: CalendarEventTime,
    anchorX: number,
    anchorY: number,
    side: "left" | "right",
  ) => void;
  onEventClick?: (
    event: CalendarEvent,
    anchorX: number,
    anchorY: number,
    side: "left" | "right",
  ) => void;
  onDragStart?: (
    event: CalendarEvent,
    columnId: string,
    type: "move" | "resize",
    clientY: number,
  ) => void;
}) {
  function handleEmptyClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rawMinutes = ((e.clientY - rect.top) / TOTAL_HEIGHT_PX) * (24 * 60);
    const side: "left" | "right" = window.innerWidth - e.clientX < 660 ? "left" : "right";
    onSlotClick("", snapToQuarter(rawMinutes), e.clientX, e.clientY, side);
  }

  return (
    <div className="relative flex flex-1 overflow-x-auto" style={{ height: TOTAL_HEIGHT_PX }}>
      {HOURS.map((h) => (
        <div
          key={h}
          className="pointer-events-none absolute left-0 right-0 border-t border-border"
          style={{ top: h * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX }}
          aria-hidden
        />
      ))}

      <CurrentTimeIndicator />

      {columns.length > 0 ? (
        columns.map((col) => (
          <DayColumn
            key={col.id}
            def={col}
            events={eventsMap[col.id] ?? []}
            selectedEventId={selectedEventId}
            pendingEditEventId={pendingEditEventId}
            hideHeader={hideHeader}
            onSlotClick={onSlotClick}
            onEventClick={onEventClick}
            onDragStart={onDragStart}
          />
        ))
      ) : (
        <div
          className="relative min-w-[85vw] flex-1 cursor-pointer md:min-w-[300px]"
          style={{ height: TOTAL_HEIGHT_PX }}
          onClick={handleEmptyClick}
          aria-label="Click to create an event"
        />
      )}
    </div>
  );
}
