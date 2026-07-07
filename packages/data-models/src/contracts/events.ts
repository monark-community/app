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
  organizationId: string | null;
  actorId: string;
  hard: boolean;
};

export type DataModelsEvents =
  | DataModelSchemaChangedEvent
  | DataModelRecordCreatedEvent
  | DataModelRecordUpdatedEvent
  | DataModelRecordDeletedEvent;
