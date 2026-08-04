"use client";

import { useState } from "react";
import { DragHandle } from "@monark/components/ui/drag-handle";
import type { CalendarEvent } from "../../contracts/types";
import { HOUR_HEIGHT_PX } from "../constants";
import { formatClockTime, type TimeFormat } from "../date-utils";

function minutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function ZapIcon({ color }: { color?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

const PUNCTUAL_HEIGHT_PX = 20;
const MARGIN_PX = 2;
const MIN_HEIGHT_PX = 20;

function colStyle(colIndex: number, colSpan: number, top: number, height: number) {
  const widthPct = (1 / colSpan) * 100;
  const leftPct = (colIndex / colSpan) * 100;
  return {
    top,
    height,
    left: `calc(${leftPct}% + ${MARGIN_PX}px)`,
    width: `calc(${widthPct}% - ${2 * MARGIN_PX}px)`,
  };
}

export function DayEventBlock({
  event,
  selected,
  pending,
  ghost,
  color,
  colIndex = 0,
  colSpan = 1,
  timeFormat = "24h",
  onClick,
  onDragStart,
}: {
  event: CalendarEvent;
  selected?: boolean;
  pending?: boolean;
  ghost?: boolean;
  color?: string;
  colIndex?: number;
  colSpan?: number;
  timeFormat?: TimeFormat;
  onClick?: (anchorX: number, anchorY: number, side: "left" | "right") => void;
  onDragStart?: (type: "move" | "resize", clientY: number) => void;
}) {
  const isPunctual =
    event.eventType === "PUNCTUAL" || event.startAt.getTime() === event.endAt.getTime();

  const startMin = minutesFromMidnight(event.startAt);
  const endMin = minutesFromMidnight(event.endAt);
  const durationMin = isPunctual ? 0 : Math.max(endMin - startMin, 15);

  const top = (startMin / 60) * HOUR_HEIGHT_PX;
  const height = isPunctual
    ? PUNCTUAL_HEIGHT_PX
    : Math.max((durationMin / 60) * HOUR_HEIGHT_PX - 2 * MARGIN_PX, MIN_HEIGHT_PX);

  const showPadding = !isPunctual && height > 28;
  const showTime = !isPunctual && height > 40;

  const position = colStyle(colIndex, colSpan, top, height);
  const effectiveColor = event.color ?? color;
  const borderColor = effectiveColor ?? undefined;
  const bgColor = effectiveColor ? `${effectiveColor}4D` : undefined;
  const pendingBgColor = effectiveColor ? `${effectiveColor}26` : undefined;

  const titleClass = `font-medium text-foreground leading-5 ${height > 40 ? "line-clamp-2" : "truncate"}`;

  const selectedOutline = selected
    ? { outline: `2px solid ${effectiveColor ?? "hsl(var(--primary))"}`, outlineOffset: "1px" }
    : {};

  const [isResizeDragging, setIsResizeDragging] = useState(false);

  const sharedHandlers = {
    // Pointer (not mouse) events unify mouse + touch, so drag-to-move works on
    // touch. stopPropagation keeps Radix's document pointerdown from treating this
    // as "outside" the open popover before the drag starts.
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      onDragStart?.("move", e.clientY);
    },
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const side: "left" | "right" = window.innerWidth - rect.right < 660 ? "left" : "right";
      onClick?.(side === "left" ? rect.left : rect.right, rect.top, side);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const side: "left" | "right" = window.innerWidth - rect.right < 660 ? "left" : "right";
        onClick?.(side === "left" ? rect.left : rect.right, rect.top, side);
      }
    },
  };

  const resizeHandle =
    onDragStart && !isPunctual ? (
      <DragHandle
        orientation="horizontal"
        color={effectiveColor ?? "hsl(var(--primary))"}
        active={isResizeDragging || !!selected}
        // Sit the grip against the very bottom edge of the block.
        className="absolute inset-x-0 bottom-0 h-4 items-end pb-0.5"
        onPointerDown={(e) => {
          e.stopPropagation();
          setIsResizeDragging(true);
          onDragStart("resize", e.clientY);
          const cleanup = () => {
            setIsResizeDragging(false);
            document.removeEventListener("pointerup", cleanup);
          };
          document.addEventListener("pointerup", cleanup);
        }}
      />
    ) : null;

  const content = isPunctual ? (
    <div className="flex items-center gap-1.5 overflow-hidden">
      <ZapIcon color={borderColor} />
      <p className="truncate font-medium text-foreground leading-5">{event.title}</p>
    </div>
  ) : (
    <>
      <p className={titleClass}>{event.title}</p>
      {showTime && (
        <p className="truncate whitespace-nowrap text-muted-foreground">
          {formatClockTime(event.startAt, timeFormat)} – {formatClockTime(event.endAt, timeFormat)}
        </p>
      )}
    </>
  );

  // Ghost: the original position of an event being actively edited — dashed border, no opacity fade
  if (ghost) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={`absolute z-30 my-0.5 cursor-grab touch-none select-none rounded-sm border-l-2 border-dashed text-xs transition-shadow ${!effectiveColor ? "border-primary bg-primary/15" : ""}`}
        style={{
          ...position,
          borderLeftColor: borderColor,
          backgroundColor: bgColor,
          ...selectedOutline,
        }}
        {...sharedHandlers}
      >
        <div className={`h-full overflow-hidden rounded-sm px-3 ${showPadding ? "py-1" : ""}`}>
          {content}
        </div>
        {resizeHandle}
      </div>
    );
  }

  // Pending: creation preview — full dashed outline, transparent bg, draggable like a regular block
  if (pending) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={`absolute z-10 my-0.5 cursor-grab touch-none select-none rounded-sm border-l-2 text-xs transition-shadow ${!effectiveColor ? "border-primary bg-primary/15" : ""}`}
        style={{ ...position, borderLeftColor: borderColor, backgroundColor: pendingBgColor }}
        {...sharedHandlers}
      >
        <div className={`h-full overflow-hidden rounded-sm px-3 ${showPadding ? "py-1" : ""}`}>
          {content}
        </div>
        {resizeHandle}
      </div>
    );
  }

  // Regular event
  return (
    <div
      role="button"
      tabIndex={0}
      className={`absolute z-20 my-0.5 cursor-grab touch-none select-none rounded-sm border-l-2 text-xs transition-shadow ${!effectiveColor ? "border-primary bg-primary/15" : ""}`}
      style={{
        ...position,
        borderLeftColor: borderColor,
        backgroundColor: bgColor,
        ...selectedOutline,
      }}
      {...sharedHandlers}
    >
      <div className={`h-full overflow-hidden rounded-sm px-3 ${showPadding ? "py-1" : ""}`}>
        {content}
      </div>
      {resizeHandle}
    </div>
  );
}
