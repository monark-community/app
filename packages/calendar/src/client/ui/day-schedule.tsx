"use client";

import type { CalendarEvent, CalendarEventTime } from "../../contracts/types";
import { TOTAL_HEIGHT_PX } from "../constants";
import type { TimeFormat } from "../date-utils";
import { DayEventBlock } from "./day-event-block";

function snapToQuarter(rawMinutes: number): CalendarEventTime {
  const clamped = Math.max(0, Math.min(rawMinutes, 24 * 60 - 15));
  const snapped = Math.round(clamped / 15) * 15;
  return { hour: Math.floor(snapped / 60) % 24, minute: snapped % 60 };
}

type PositionedEvent = {
  event: CalendarEvent;
  colIndex: number;
  colSpan: number;
};

function computeOverlapLayout(events: CalendarEvent[]): PositionedEvent[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => {
    const d = a.startAt.getTime() - b.startAt.getTime();
    return d !== 0 ? d : b.endAt.getTime() - a.endAt.getTime();
  });

  // Step 1: greedy column assignment — find the leftmost free column for each event
  const colEnds: number[] = [];
  const assignments: Array<{ event: CalendarEvent; colIndex: number }> = [];

  for (const event of sorted) {
    const startMs = event.startAt.getTime();
    let placed = false;
    for (let i = 0; i < colEnds.length; i++) {
      if (colEnds[i]! <= startMs) {
        colEnds[i] = event.endAt.getTime();
        assignments.push({ event, colIndex: i });
        placed = true;
        break;
      }
    }
    if (!placed) {
      assignments.push({ event, colIndex: colEnds.length });
      colEnds.push(event.endAt.getTime());
    }
  }

  // Step 2: sweep to find cluster boundaries — events connected by overlap share colSpan
  const result: PositionedEvent[] = [];
  let clusterStart = 0;
  let sweepEndMs = assignments[0]!.event.endAt.getTime();
  let maxCol = assignments[0]!.colIndex;

  const flushCluster = (end: number) => {
    const colSpan = maxCol + 1;
    for (let j = clusterStart; j < end; j++) {
      const a = assignments[j]!;
      result.push({ event: a.event, colIndex: a.colIndex, colSpan });
    }
  };

  for (let i = 1; i < assignments.length; i++) {
    const { event, colIndex } = assignments[i]!;
    const startMs = event.startAt.getTime();
    const endMs = event.endAt.getTime();

    if (startMs >= sweepEndMs) {
      flushCluster(i);
      clusterStart = i;
      sweepEndMs = endMs;
      maxCol = colIndex;
    } else {
      if (endMs > sweepEndMs) sweepEndMs = endMs;
      if (colIndex > maxCol) maxCol = colIndex;
    }
  }
  flushCluster(assignments.length);

  return result;
}

export function DaySchedule({
  columnId,
  events,
  selectedEventId,
  pendingEditEventId,
  color,
  timeFormat,
  onSlotClick,
  onEventClick,
  onDragStart,
}: {
  columnId: string;
  events: CalendarEvent[];
  selectedEventId?: string | null;
  pendingEditEventId?: string | null;
  color?: string;
  timeFormat?: TimeFormat;
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
  const layout = computeOverlapLayout(events);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rawMinutes = ((e.clientY - rect.top) / TOTAL_HEIGHT_PX) * (24 * 60);
    const side: "left" | "right" = window.innerWidth - rect.right < 660 ? "left" : "right";
    onSlotClick(
      columnId,
      snapToQuarter(rawMinutes),
      side === "left" ? rect.left : rect.right,
      e.clientY,
      side,
    );
  }

  return (
    <div
      className="relative flex-1 cursor-pointer"
      style={{ minHeight: TOTAL_HEIGHT_PX }}
      onClick={handleClick}
    >
      {layout.map(({ event, colIndex, colSpan }) => {
        const isGhost = pendingEditEventId != null && event.id === pendingEditEventId;
        return (
          <DayEventBlock
            key={event.id}
            event={event}
            selected={selectedEventId === event.id}
            pending={event.id === "__pending__"}
            ghost={isGhost}
            color={color}
            colIndex={colIndex}
            colSpan={colSpan}
            timeFormat={timeFormat}
            onClick={(ax, ay, side) => onEventClick?.(event, ax, ay, side)}
            onDragStart={(type, clientY) => onDragStart?.(event, columnId, type, clientY)}
          />
        );
      })}
    </div>
  );
}
