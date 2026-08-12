"use client";

import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@monark/components";
import { KANBAN_PRIORITY_COLOR, type KanbanCardPriority } from "../../contracts/types";

/** Resolved assignee display data (the web layer maps a userId → this). */
export type CardAssignee = { name: string; avatarUrl?: string };
/** Priority to show on the card : the level (drives the colour) + a translated label. */
export type CardPriority = { level: KanbanCardPriority; label: string };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * A single draggable Kanban card. Pure presentation : the web layer wires
 * drag-and-drop (dnd-kit `useSortable`, passing `cardRef` / `style` /
 * `dragProps`) and resolves `assignee` / `priority` / `dueLabel`. The whole card
 * is both the drag handle and the click target (`onClick` opens the editor ; a
 * real drag is distinguished by the pointer sensor's activation distance, and a
 * post-drag click is suppressed by the browser).
 */
export function KanbanCard({
  title,
  assignees,
  priority,
  estimate,
  checklist,
  dueLabel,
  dueOverdue,
  isDragging,
  isOverlay,
  cardRef,
  style,
  dragProps,
  onOpen,
}: {
  title: string;
  /** Resolved assignees, shown as an overlapping avatar stack (may be empty). */
  assignees?: CardAssignee[];
  priority?: CardPriority;
  estimate?: number;
  /** Checklist progress (derived from the card body's check-list blocks) ; the
   *  bar shows only when `total > 0`. */
  checklist?: { done: number; total: number };
  dueLabel?: string;
  dueOverdue?: boolean;
  isDragging?: boolean;
  /** True when rendered inside a DragOverlay (adds a lifted shadow). */
  isOverlay?: boolean;
  cardRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  dragProps?: HTMLAttributes<HTMLDivElement>;
  onOpen?: () => void;
}) {
  const assigneeList = assignees ?? [];
  const hasChecklist = checklist != null && checklist.total > 0;
  const hasMeta = Boolean(priority || estimate != null || dueLabel || assigneeList.length > 0);
  return (
    <div
      ref={cardRef}
      style={style}
      onClick={onOpen}
      className={cn(
        // `overflow-hidden` so the subtask progress bar (which breaks out of the
        // padding with negative margins to sit flush at the bottom) clips to the
        // card's rounded corners.
        "select-none overflow-hidden rounded-md border border-border bg-background p-3 text-left text-sm shadow-sm",
        // No `touch-none` : on touch the browser keeps the pan/scroll gesture,
        // and dnd-kit's TouchSensor only starts a drag after a long-press (see
        // the board's sensors). A quick swipe scrolls the board / column.
        "cursor-grab active:cursor-grabbing",
        "transition-shadow hover:border-foreground/20 hover:shadow-md",
        isDragging && "opacity-40",
        isOverlay && "rotate-2 cursor-grabbing shadow-lg",
      )}
      {...dragProps}
    >
      <p className="mb-1.5 font-medium leading-snug text-foreground">
        <span className="line-clamp-3">{title}</span>
      </p>
      {hasMeta && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {assigneeList.length > 0 && <AssigneeStack assignees={assigneeList} />}
          {estimate != null && <EstimateChip estimate={estimate} />}
          {priority && <PriorityPill priority={priority} />}
          {dueLabel && <DueBadge label={dueLabel} overdue={dueOverdue} />}
        </div>
      )}
      {hasChecklist && <ChecklistBar done={checklist.done} total={checklist.total} />}
    </div>
  );
}

// Faded colour badge (tinted background + solid colour text), matching the
// Data-Models select badges. Priority colours are raw hex (the package isn't in
// the app's Tailwind `@source` scan), so the tint is the same hex at ~15% alpha.
function PriorityPill({ priority }: { priority: CardPriority }): ReactNode {
  const color = KANBAN_PRIORITY_COLOR[priority.level];
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
      style={{ color, backgroundColor: `${color}26` }}
    >
      {priority.label}
    </span>
  );
}

function EstimateChip({ estimate }: { estimate: number }): ReactNode {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
      <GaugeIcon className="h-3 w-3" />
      {estimate}
    </span>
  );
}

// Checklist progress as a thin bar flush with the card's bottom edge. It's a
// normal-flow element (so it reserves its own space and content — e.g. the
// z-indexed avatar stack — can't paint over it). The card is `overflow-hidden`,
// so it clips to the rounded corners. Brand primary while in progress, green
// once every item is done ; the exact `done/total` is on the title/aria for
// hover + screen readers.
//
// EVERYTHING here is inline `style`, not Tailwind classes : the package is NOT
// in the app's Tailwind `@source` scan, so a utility used only here (the
// negative-margin breakout, the height, the fill height, the gap) is silently
// NOT generated in the real app — which made the bar vanish / collapse. Inline
// styles always apply. `-0.75rem` margins cancel the card's `p-3` so the bar
// spans the full card width flush to the bottom edge.
function ChecklistBar({ done, total }: { done: number; total: number }): ReactNode {
  const complete = done >= total;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div
      style={{
        marginTop: "1.25rem",
        marginLeft: "-0.75rem",
        marginRight: "-0.75rem",
        marginBottom: "-0.75rem",
        height: "0.5rem",
        // Translucent neutral grey reads as a track on both light + dark cards
        // (an inline value can't reference the theme's `muted` token).
        backgroundColor: "rgb(128 128 128 / 0.2)",
      }}
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${done}/${total}`}
      title={`${done}/${total}`}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          backgroundColor: complete ? "#16a34a" : "var(--primary)",
        }}
      />
    </div>
  );
}

function DueBadge({ label, overdue }: { label: string; overdue?: boolean }): ReactNode {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
        overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
      )}
    >
      <CalendarIcon className="h-3 w-3" />
      {label}
    </span>
  );
}

// Overlapping avatar stack, capped at MAX with a "+N" overflow chip. Each
// avatar carries a background-coloured ring so they read as distinct even when
// overlapping. Order matches the assignee order (first assignee frontmost).
function AssigneeStack({ assignees }: { assignees: CardAssignee[] }): ReactNode {
  const MAX = 3;
  const shown = assignees.slice(0, MAX);
  const extra = assignees.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((assignee, i) => (
        <span
          key={i}
          className="rounded-full ring-2 ring-background"
          style={{ marginLeft: i === 0 ? 0 : -6, zIndex: shown.length - i }}
        >
          <AssigneeAvatar assignee={assignee} />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="flex h-6 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground ring-2 ring-background"
          style={{ marginLeft: -6 }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

function AssigneeAvatar({ assignee }: { assignee: CardAssignee }): ReactNode {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
      title={assignee.name}
    >
      {assignee.avatarUrl ? (
        <img src={assignee.avatarUrl} alt={assignee.name} className="h-full w-full object-cover" />
      ) : (
        initials(assignee.name)
      )}
    </span>
  );
}

// Hand-rolled icons (the client package intentionally has no lucide dependency,
// mirroring the calendar package's inline SVGs). `currentColor` inherits the
// surrounding text color.
function CalendarIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function GaugeIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path d="M12 14 4 6" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}
