import type { DomainEventBase } from "@monark/common/contracts/events";

// Domain events emitted by the Wiki module. Every state-changing mutation emits
// one so other modules + the webhook outbox can react without coupling.
// `actorId` is the user who performed the action ; ids let a subscriber load
// whatever it needs without the event carrying the whole page.

export type WikiPageCreatedEvent = DomainEventBase & {
  type: "wiki.page-created";
  pageId: string;
  organizationId: string;
  parentId: string | null;
  title: string;
  actorId: string;
};

/** Which fields a page update touched (drives future notification copy). */
export type WikiPageChange = "title" | "icon" | "content";

export type WikiPageUpdatedEvent = DomainEventBase & {
  type: "wiki.page-updated";
  pageId: string;
  organizationId: string;
  changed: WikiPageChange[];
  actorId: string;
};

export type WikiPageMovedEvent = DomainEventBase & {
  type: "wiki.page-moved";
  pageId: string;
  organizationId: string;
  fromParentId: string | null;
  toParentId: string | null;
  actorId: string;
};

export type WikiPageDeletedEvent = DomainEventBase & {
  type: "wiki.page-deleted";
  pageId: string;
  organizationId: string;
  /** Ids of every page removed (the target + its descendants). */
  pageIds: string[];
  actorId: string;
};

export type WikiEvents =
  | WikiPageCreatedEvent
  | WikiPageUpdatedEvent
  | WikiPageMovedEvent
  | WikiPageDeletedEvent;
