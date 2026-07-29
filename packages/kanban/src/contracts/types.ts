// Pure, serializable domain types shared by the Kanban server and client.
// These mirror the Prisma rows but stay transport-safe (no Prisma imports) so
// the client bundle can depend on them. Type names are suffixed to avoid
// colliding with the React component names in `client/ui/*` (e.g. the type
// `CardItem` vs the `KanbanCard` component).

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

/** A single checklist item on a card. Stored inline (JSON), order-preserving. */
export type KanbanSubtask = {
  id: string;
  title: string;
  done: boolean;
};

/** Max subtasks per card. */
export const KANBAN_SUBTASK_MAX = 50;

/**
 * Coerce an untyped value (a Prisma `Json` column, or client input) into a
 * well-formed `KanbanSubtask[]`, dropping anything malformed. Subtasks are
 * stored as JSON, so every read crosses an `unknown` boundary — this is the one
 * place that shape is trusted.
 */
export function parseSubtasks(value: unknown): KanbanSubtask[] {
  if (!Array.isArray(value)) return [];
  const out: KanbanSubtask[] = [];
  for (const item of value) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as { id?: unknown }).id === "string" &&
      typeof (item as { title?: unknown }).title === "string"
    ) {
      const it = item as { id: string; title: string; done?: unknown };
      // Cap the title defensively (subtasks can arrive as an opaque JSON string).
      out.push({ id: it.id.slice(0, 64), title: it.title.slice(0, 500), done: it.done === true });
    }
  }
  return out.slice(0, KANBAN_SUBTASK_MAX);
}

export type CardItem = {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  /** Org member userIds the card is assigned to (order-preserving, may be empty). */
  assigneeIds: string[];
  /** Org member userIds set as reviewers (order-preserving, may be empty). */
  reviewerIds: string[];
  dueAt?: Date;
  priority?: KanbanCardPriority;
  /** Effort estimate (story points / hours — caller's convention). */
  estimate?: number;
  /** Inline checklist items (order-preserving, may be empty). */
  subtasks: KanbanSubtask[];
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
