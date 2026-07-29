import { registerEventTypes } from "@monark/common";

// Operator-facing descriptions for the webhook subscription picker. Registering
// these is what makes every Kanban domain event webhook-subscribable — no
// webhook code change is needed beyond this.
const KANBAN_EVENT_TYPES = {
  "kanban.board-created": {
    description: "A new Kanban board was created.",
    fields: [
      { key: "boardId", type: "string", description: "The board that was created." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the board belongs to.",
      },
      { key: "name", type: "string", description: "The board's name." },
      { key: "actorId", type: "string", description: "The user who created the board." },
    ],
  },
  "kanban.column-created": {
    description: "A column was added to a board.",
    fields: [
      { key: "boardId", type: "string", description: "The board the column was added to." },
      { key: "columnId", type: "string", description: "The newly created column's id." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the board belongs to.",
      },
      { key: "name", type: "string", description: "The column's name." },
      { key: "actorId", type: "string", description: "The user who created the column." },
    ],
  },
  "kanban.card-created": {
    description: "A card was created on a board.",
    fields: [
      { key: "boardId", type: "string", description: "The board the card was created on." },
      { key: "columnId", type: "string", description: "The column the card was created in." },
      { key: "cardId", type: "string", description: "The newly created card's id." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the board belongs to.",
      },
      { key: "title", type: "string", description: "The card's title." },
      { key: "assigneeIds", type: "object", description: "The card's assignee user ids." },
      { key: "actorId", type: "string", description: "The user who created the card." },
    ],
  },
  "kanban.card-updated": {
    description: "A card's title, description, assignee, or due date was edited.",
    fields: [
      { key: "boardId", type: "string", description: "The board the card belongs to." },
      { key: "cardId", type: "string", description: "The card that was updated." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the board belongs to.",
      },
      { key: "changed", type: "object", description: "List of card fields that changed." },
      { key: "assigneeIds", type: "object", description: "The card's current assignee user ids." },
      { key: "actorId", type: "string", description: "The user who updated the card." },
    ],
  },
  "kanban.card-moved": {
    description:
      "A card moved to a different column or position. An in-column reorder fires this too (from and to column match).",
    fields: [
      { key: "boardId", type: "string", description: "The board the card belongs to." },
      { key: "cardId", type: "string", description: "The card that moved." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the board belongs to.",
      },
      { key: "fromColumnId", type: "string", description: "The column the card moved from." },
      { key: "toColumnId", type: "string", description: "The column the card moved to." },
      { key: "actorId", type: "string", description: "The user who moved the card." },
    ],
  },
  "kanban.card-deleted": {
    description: "A card was deleted.",
    fields: [
      { key: "boardId", type: "string", description: "The board the card belonged to." },
      { key: "cardId", type: "string", description: "The card that was deleted." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the board belongs to.",
      },
      { key: "actorId", type: "string", description: "The user who deleted the card." },
    ],
  },
  "kanban.card-assigned": {
    description:
      "A card was assigned to a user (on creation with an assignee, or a reassignment to a new one).",
    fields: [
      { key: "boardId", type: "string", description: "The board the card belongs to." },
      {
        key: "boardName",
        type: "string",
        description: "The board's name, carried to avoid a lookup.",
      },
      { key: "cardId", type: "string", description: "The card that was assigned." },
      {
        key: "cardTitle",
        type: "string",
        description: "The card's title, carried to avoid a lookup.",
      },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the board belongs to.",
      },
      { key: "assigneeId", type: "string", description: "The user the card was assigned to." },
      { key: "assignedById", type: "string", description: "The user who assigned the card." },
    ],
  },
} as const;

export function registerKanbanEventTypes(): void {
  registerEventTypes("kanban", KANBAN_EVENT_TYPES);
}
