import type { DomainEventBase } from "@monark/common/contracts/events";

// Emitted on Data Model / Data Field schema mutations.
export type DataModelSchemaChangedEvent = DomainEventBase & {
  type: "data-models.schema-changed";
  dataModelId: string;
  kind: "model" | "field" | "integration";
  actorId: string;
};

// Emitted on DataRecord CRUD. `dataModelKey` rides along so a subscriber
// (e.g. Calendar's planned materialization subscriber) can filter by model
// without a round-trip lookup. See docs/features-planning/phase-2/
// polymorphic-db.md, "Integration points".
export type DataModelRecordCreatedEvent = DomainEventBase & {
  type: "data-models.record-created";
  dataModelId: string;
  dataModelKey: string;
  recordId: string;
  organizationId: string | null;
  actorId: string;
};

export type DataModelRecordUpdatedEvent = DomainEventBase & {
  type: "data-models.record-updated";
  dataModelId: string;
  dataModelKey: string;
  recordId: string;
  organizationId: string | null;
  actorId: string;
  // DataField.key values that changed, plus "title" / "slug" when the
  // denormalized envelope columns moved.
  changed: string[];
};

export type DataModelRecordDeletedEvent = DomainEventBase & {
  type: "data-models.record-deleted";
  dataModelId: string;
  dataModelKey: string;
  recordId: string;
  // Carried on the event because a `hard: true` delete removes the row before
  // subscribers run, so the title can't be looked up afterward (the watcher
  // notification needs it).
  recordTitle: string;
  organizationId: string | null;
  actorId: string;
  hard: boolean;
};

// Emitted when a record is created through a public form (anonymous shareable
// link or an email invite). The submit path ALSO emits a normal
// `data-models.record-created` (so watchers / automation / webhooks keep
// working) ; this event carries the form-specific context.
export type DataFormSubmittedEvent = DomainEventBase & {
  type: "data-models.form-submitted";
  dataModelId: string;
  dataModelKey: string;
  recordId: string;
  formId: string;
  mode: "anonymous" | "email";
  // The invited recipient's email for EMAIL mode ; null for anonymous.
  submitterEmail: string | null;
  organizationId: string | null;
};

// Emitted when an admin approves a public-form submission onto the public board
// (it becomes visible + searchable). Lets automation / webhooks react to
// "an entry went public" (e.g. announce a new published feature request).
export type DataFormEntryPublishedEvent = DomainEventBase & {
  type: "data-models.form-entry-published";
  dataModelId: string;
  dataModelKey: string;
  recordId: string;
  formId: string;
  organizationId: string | null;
};

// Emitted when a logged-in user posts a comment on a record (auto-published).
// Drives the discussion notification to the record's watchers.
export type DataRecordCommentedEvent = DomainEventBase & {
  type: "data-models.record-commented";
  dataModelId: string;
  dataModelKey: string;
  recordId: string;
  commentId: string;
  authorId: string;
  organizationId: string | null;
};

export type DataModelsEvents =
  | DataModelSchemaChangedEvent
  | DataModelRecordCreatedEvent
  | DataModelRecordUpdatedEvent
  | DataModelRecordDeletedEvent
  | DataFormSubmittedEvent
  | DataFormEntryPublishedEvent
  | DataRecordCommentedEvent;
