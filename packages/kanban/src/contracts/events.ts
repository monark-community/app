import type { DomainEventBase } from "@monark/common/contracts/events";

// Domain events emitted by the Kanban module. Every state-changing mutation
// emits one so other modules, the webhook outbox, and the future automation
// system can react without coupling. `actorId` is the user who performed the
// action ; ids let a subscriber load whatever it needs without the event
// carrying the whole row.

export type KanbanBoardCreatedEvent = DomainEventBase & {
  type: "kanban.board-created";
  boardId: string;
  organizationId: string;
  name: string;
  actorId: string;
};

export type KanbanColumnCreatedEvent = DomainEventBase & {
  type: "kanban.column-created";
  boardId: string;
  columnId: string;
  organizationId: string;
  name: string;
  actorId: string;
};

export type KanbanCardCreatedEvent = DomainEventBase & {
  type: "kanban.card-created";
  boardId: string;
  columnId: string;
  cardId: string;
  organizationId: string;
  title: string;
  assigneeIds: string[];
  actorId: string;
};

export type KanbanCardUpdatedEvent = DomainEventBase & {
  type: "kanban.card-updated";
  boardId: string;
  cardId: string;
  organizationId: string;
  // Which fields changed, so a subscriber can filter (e.g. only react to a
  // reassignment). `assignee` fires when the card's assignee set changed.
  changed: Array<
    "title" | "description" | "assignee" | "reviewer" | "dueAt" | "priority" | "estimate"
  >;
  assigneeIds: string[];
  actorId: string;
};

// The load-bearing Kanban event: a card moved to a (possibly different) column
// and/or position. `fromColumnId === toColumnId` means an in-column reorder.
export type KanbanCardMovedEvent = DomainEventBase & {
  type: "kanban.card-moved";
  boardId: string;
  cardId: string;
  organizationId: string;
  fromColumnId: string;
  toColumnId: string;
  actorId: string;
};

export type KanbanCardDeletedEvent = DomainEventBase & {
  type: "kanban.card-deleted";
  boardId: string;
  cardId: string;
  organizationId: string;
  actorId: string;
};

// Fires when a card gains or changes its assignee (on create with an assignee,
// or an update that sets a new one). Carries the board name + card title so a
// subscriber can notify without a DB round-trip. `assignedById` is the actor.
export type KanbanCardAssignedEvent = DomainEventBase & {
  type: "kanban.card-assigned";
  boardId: string;
  boardName: string;
  cardId: string;
  cardTitle: string;
  organizationId: string;
  assigneeId: string;
  assignedById: string;
};

export type KanbanEvents =
  | KanbanBoardCreatedEvent
  | KanbanColumnCreatedEvent
  | KanbanCardCreatedEvent
  | KanbanCardUpdatedEvent
  | KanbanCardMovedEvent
  | KanbanCardDeletedEvent
  | KanbanCardAssignedEvent;
