// Public surface of @monark/kanban/client.
// Pure React UI primitives (no shadcn/radix/dnd-kit imports). The full wired,
// drag-and-drop board lives in services/web and composes these.

export { BoardArea } from "./ui/board-area";
export { BoardColumn } from "./ui/board-column";
export { KanbanCard, type CardAssignee, type CardPriority } from "./ui/kanban-card";
export { COLUMN_WIDTH_PX } from "./constants";
export type { BoardDef, BoardColumnDef, CardItem, KanbanCardPriority } from "../contracts/types";
export { DEFAULT_COLUMN_NAMES, KANBAN_PRIORITIES, KANBAN_PRIORITY_COLOR } from "../contracts/types";
