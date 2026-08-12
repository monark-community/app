// Pure, serializable domain types shared by the Kanban server and client.
// These mirror the Prisma rows but stay transport-safe (no Prisma imports) so
// the client bundle can depend on them. Type names are suffixed to avoid
// colliding with the React component names in `client/ui/*` (e.g. the type
// `CardItem` vs the `KanbanCard` component).

import type { DocumentBlock } from "@monark/common/blocks";

export type BoardDef = {
  id: string;
  name: string;
  description?: string;
  color?: string;
};

export type BoardColumnDef = {
  id: string;
  boardId: string;
  name: string;
  color?: string;
  position: number;
  /** Optional soft cap on cards, surfaced (not enforced) in the UI. */
  wipLimit?: number;
};

/** Card priority, ascending in severity. `null`/absent = unset. */
export type KanbanCardPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** All priorities, low → critical (option order for pickers). */
export const KANBAN_PRIORITIES: readonly KanbanCardPriority[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

/** Severity colour per priority (hex ; escalating slate → red). Shared by the
 *  card's priority dot and the editor's picker so they stay in sync. Applied as
 *  an inline style, so no Tailwind class scanning is needed. */
export const KANBAN_PRIORITY_COLOR: Record<KanbanCardPriority, string> = {
  LOW: "#94a3b8",
  MEDIUM: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

export type CardItem = {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  /** Card body as a BlockNote block array (JSON). */
  description?: DocumentBlock[];
  /** Org member userIds the card is assigned to (order-preserving, may be empty). */
  assigneeIds: string[];
  /** Org member userIds set as reviewers (order-preserving, may be empty). */
  reviewerIds: string[];
  dueAt?: Date;
  priority?: KanbanCardPriority;
  /** Effort estimate (story points / hours — caller's convention). */
  estimate?: number;
  position: number;
};

/**
 * The default columns seeded into a brand-new board (in order), each with a
 * progression colour so the header dots read as a pipeline out of the box
 * (grey backlog → blue todo → amber in-progress → purple review → cyan QA →
 * green done). Users can recolour any column afterwards.
 */
export const DEFAULT_COLUMNS = [
  { name: "Backlog", color: "#94a3b8" },
  { name: "Todo", color: "#3b82f6" },
  { name: "In Progress", color: "#f59e0b" },
  { name: "Review", color: "#a855f7" },
  { name: "QA", color: "#06b6d4" },
  { name: "Done", color: "#22c55e" },
] as const;

/** Names of the default columns, in order (derived from {@link DEFAULT_COLUMNS}). */
export const DEFAULT_COLUMN_NAMES = DEFAULT_COLUMNS.map((c) => c.name);
