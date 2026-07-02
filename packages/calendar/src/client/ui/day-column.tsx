"use client";

import type { CalendarEvent, CalendarEventTime, ColumnDef } from "../../contracts/types";
import { DayColumnHeader } from "./day-column-header";
import { DaySchedule } from "./day-schedule";

export function DayColumn({
  def,
  events,
  selectedEventId,
  pendingEditEventId,
  hideHeader,
  onSlotClick,
  onEventClick,
  onDragStart,
}: {
  def: ColumnDef;
  events: CalendarEvent[];
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
  return (
    <div
      data-col-id={def.id}
      className="flex min-w-[85vw] flex-1 flex-col border-r border-border last:border-r-0 h-full px-px md:min-w-[300px]"
    >
      {!hideHeader && (
        <DayColumnHeader title={def.title} description={def.description} color={def.color} />
      )}
      <DaySchedule
        columnId={def.id}
        events={events}
        selectedEventId={selectedEventId}
        pendingEditEventId={pendingEditEventId}
        color={def.color}
        onSlotClick={onSlotClick}
        onEventClick={onEventClick}
        onDragStart={onDragStart}
      />
    </div>
  );
}
