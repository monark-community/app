"use client";

import type { ReactNode, Ref } from "react";
import { cn } from "@monark/components";
import { COLUMN_WIDTH_PX } from "../constants";

/**
 * A board column : a fixed-width, full-height vertical stack with a header
 * (optional drag-handle slot + color accent + name + card count) and a
 * scrollable body of cards. Flat on the board background — no raised card ;
 * columns are separated by a right divider border and sit flush (no gap).
 *
 * The `<section>` is a `group/col`, so hover-revealed affordances the web layer
 * supplies — the `dragHandle` grip and an "add card" child — use
 * `group-hover/col:` to appear on column hover (and stay visible on touch).
 * Pure presentation : the web layer makes the body a dnd-kit droppable via
 * `bodyRef` and toggles `isOver` for the drop highlight.
 */
export function BoardColumn({
  name,
  count,
  color,
  wipLimit,
  isOver,
  dragHandle,
  headerRight,
  bodyRef,
  children,
}: {
  name: string;
  count: number;
  color?: string;
  wipLimit?: number;
  isOver?: boolean;
  /** Grip rendered at the far left, before the colour dot (the web supplies a
   *  sortable-wired button that reveals on `group-hover/hdr` and collapses its
   *  width when hidden). */
  dragHandle?: ReactNode;
  headerRight?: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
}) {
  const overLimit = wipLimit != null && count > wipLimit;
  return (
    <section
      className={cn(
        "group/col flex h-full min-h-0 shrink-0 flex-col border-r border-border transition-colors",
        isOver && "bg-primary/5",
      )}
      style={{ width: COLUMN_WIDTH_PX }}
      aria-label={name}
    >
      <header className="group/hdr flex items-center gap-1.5 border-b border-border px-3 py-2">
        {/* Drag grip (supplied by the web layer) sits at the far left and reveals
            on hover / touch, collapsing its own width when hidden so the colour
            dot reads as flush-left at rest. The dot then leads the name. */}
        {dragHandle}
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color ?? "hsl(var(--muted-foreground))" }}
          aria-hidden
        />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{name}</h3>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 text-xs tabular-nums",
            overLimit ? "bg-destructive/10 text-destructive" : "text-muted-foreground",
          )}
        >
          {wipLimit != null ? `${count} / ${wipLimit}` : count}
        </span>
        {headerRight}
      </header>
      <div
        ref={bodyRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors",
          isOver && "bg-primary/10",
        )}
      >
        {children}
      </div>
    </section>
  );
}
