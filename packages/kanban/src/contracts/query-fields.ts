import type { FilterableKind } from "@monark/query/contracts";

/**
 * The queryable Kanban card fields and the {@link FilterableKind} each filters
 * as — the single source of truth shared by the server compiler
 * (`server/query-compiler.ts`) and the web query bar (which builds its
 * `QueryFieldMeta[]` with localized labels + per-board options). User-facing
 * keys map to real `KanbanCard` columns in the compiler (`status` → `columnId`,
 * `assignee` → `assigneeIds`, `due` → `dueAt`, …).
 */
export const KANBAN_QUERY_FIELD_KINDS = {
  title: "text",
  description: "text",
  status: "select",
  assignee: "multiSelect",
  reviewer: "multiSelect",
  priority: "orderedSelect",
  due: "date",
  estimate: "number",
  created: "date",
  updated: "date",
} as const satisfies Record<string, FilterableKind>;

export type KanbanQueryFieldKey = keyof typeof KANBAN_QUERY_FIELD_KINDS;

/** Priority severity order (low → high). Drives `orderedSelect` range expansion
 *  (`priority:>=HIGH`) in the compiler and the option order in the bar. */
export const KANBAN_PRIORITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
