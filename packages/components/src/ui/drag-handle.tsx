"use client";

import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import { cn } from "../lib/cn";

type Orientation = "horizontal" | "vertical";

// A `horizontal` grip lies flat and is grabbed to drag *up / down* (a top or
// bottom edge → `ns-resize`); a `vertical` grip stands up and is grabbed to
// drag *left / right* (a side edge → `col-resize`). Callers can still override
// the cursor via `className`.
const CURSOR: Record<Orientation, string> = {
  horizontal: "cursor-ns-resize",
  vertical: "cursor-col-resize",
};

const GRIP_SIZE: Record<Orientation, string> = {
  horizontal: "h-1 w-8",
  vertical: "h-8 w-1",
};

export type DragHandleProps = {
  orientation: Orientation;
  /**
   * Explicit grip color (any CSS color) — e.g. a calendar event's own color.
   * Omit for the neutral token used on the panel / table resize edges.
   */
  color?: string;
  /**
   * Force the grip fully visible — pass the caller's "in use" state (a calendar
   * event is selected, a resize drag is underway). It otherwise reveals on
   * hover, and is always shown on coarse-pointer (touch) devices where there is
   * no hover to reveal it.
   */
  active?: boolean;
  /**
   * Also tint the whole hit-area strip (not just show the grip) on hover and
   * while `active`. Reads well on a long edge like the detail-panel resize rail
   * where a full-height highlight advertises the grab zone; leave off for short
   * edges where the chip alone is enough.
   */
  highlight?: boolean;
} & Omit<ComponentPropsWithoutRef<"div">, "color">;

/**
 * The chip-style grab affordance shared by the app's resizable / draggable
 * edges — the little pill at the bottom of a calendar event and on the resize
 * edge of the detail panel and table columns.
 *
 * `DragHandle` renders the interactive hit area; the caller positions and sizes
 * it with `className` (e.g. `absolute inset-x-0 bottom-0 h-4`) and wires the
 * drag with the usual handlers (`onPointerDown`, `onMouseDown`, …), which are
 * forwarded to the hit area. The visible grip inside stays hidden until hover
 * unless `active`.
 */
export function DragHandle({
  orientation,
  color,
  active = false,
  highlight = false,
  className,
  ...props
}: DragHandleProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "group flex select-none items-center justify-center touch-none",
        CURSOR[orientation],
        highlight && "transition-colors hover:bg-muted-foreground/20",
        highlight && active && "bg-muted-foreground/20",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          // A fully *opaque* neutral grip — a translucent fill (e.g.
          // `muted-foreground/40`) visibly washes out over a tinted backdrop
          // like the highlight rail. `color-mix` bakes the same soft tone into
          // a solid colour so it keeps its contrast on any background. The
          // opacity utilities below drive only the hover reveal, not the fill.
          "rounded-full bg-[color-mix(in_oklab,var(--muted-foreground)_50%,var(--background))] transition-opacity",
          GRIP_SIZE[orientation],
          "opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100",
          active && "opacity-100",
        )}
        style={color ? ({ backgroundColor: color } as CSSProperties) : undefined}
      />
    </div>
  );
}
