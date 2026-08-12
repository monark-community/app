import { registerEventTypes } from "@monark/common";

const DATA_MODELS_EVENT_TYPES = {
  "data-models.schema-changed": {
    description: "A Data Model or one of its fields was created, edited, reordered, or archived.",
    fields: [
      { key: "dataModelId", type: "string", description: "The data model whose schema changed." },
      { key: "kind", type: "string", description: "What changed: model, field, or integration." },
      { key: "actorId", type: "string", description: "The user who changed the schema." },
    ],
  },
  "data-models.record-created": {
    description: "A new Data Record was created.",
    fields: [
      { key: "dataModelId", type: "string", description: "The data model the record belongs to." },
      {
        key: "dataModelKey",
        type: "string",
        description: "The data model's key, for filtering without lookup.",
      },
      { key: "recordId", type: "string", description: "The newly created record's id." },
      {
        key: "organizationId",
        type: "string",
        description: "The record's org scope, or null for platform-tier.",
      },
      { key: "actorId", type: "string", description: "The user who created the record." },
    ],
  },
  "data-models.record-updated": {
    description: "A Data Record's fields, title, or slug changed.",
    fields: [
      { key: "dataModelId", type: "string", description: "The data model the record belongs to." },
      {
        key: "dataModelKey",
        type: "string",
        description: "The data model's key, for filtering without lookup.",
      },
      { key: "recordId", type: "string", description: "The record that was updated." },
      {
        key: "organizationId",
        type: "string",
        description: "The record's org scope, or null for platform-tier.",
      },
      { key: "actorId", type: "string", description: "The user who updated the record." },
      {
        key: "changed",
        type: "object",
        description: "Field keys that changed, plus title or slug.",
      },
    ],
  },
  "data-models.record-deleted": {
    description: "A Data Record was soft-deleted (`hard: false`) or hard-deleted (`hard: true`).",
    fields: [
      { key: "dataModelId", type: "string", description: "The data model the record belonged to." },
      {
        key: "dataModelKey",
        type: "string",
        description: "The data model's key, for filtering without lookup.",
      },
      { key: "recordId", type: "string", description: "The record that was deleted." },
      {
        key: "recordTitle",
        type: "string",
        description: "The record's title, carried since hard-delete removes it.",
      },
      {
        key: "organizationId",
        type: "string",
        description: "The record's org scope, or null for platform-tier.",
      },
      { key: "actorId", type: "string", description: "The user who deleted the record." },
      { key: "hard", type: "boolean", description: "True for hard-delete, false for soft-delete." },
    ],
  },
  "data-models.form-submitted": {
    description: "A record was submitted through a public form (anonymous link or email invite).",
    fields: [
      { key: "dataModelId", type: "string", description: "The data model the record belongs to." },
      {
        key: "dataModelKey",
        type: "string",
        description: "The data model's key, for filtering without lookup.",
      },
      { key: "recordId", type: "string", description: "The submitted record's id." },
      { key: "formId", type: "string", description: "The public form that was submitted." },
      { key: "mode", type: "string", description: "Submission mode: anonymous or email." },
      {
        key: "submitterEmail",
        type: "string",
        description: "The invited recipient's email (email mode), or null.",
      },
      {
        key: "organizationId",
        type: "string",
        description: "The record's org scope, or null for platform-tier.",
      },
    ],
  },
  "data-models.form-entry-published": {
    description: "An admin approved a public-form submission onto the public board (now visible).",
    fields: [
      { key: "dataModelId", type: "string", description: "The data model the record belongs to." },
      { key: "dataModelKey", type: "string", description: "The data model's key." },
      { key: "recordId", type: "string", description: "The published record's id." },
      { key: "formId", type: "string", description: "The public form / board." },
      {
        key: "organizationId",
        type: "string",
        description: "The record's org scope, or null for platform-tier.",
      },
    ],
  },
  "data-models.record-commented": {
    description: "A user posted a comment on a Data Record (discussions).",
    fields: [
      { key: "dataModelId", type: "string", description: "The data model the record belongs to." },
      { key: "dataModelKey", type: "string", description: "The data model's key." },
      { key: "recordId", type: "string", description: "The record that was commented on." },
      { key: "commentId", type: "string", description: "The new comment's id." },
      { key: "authorId", type: "string", description: "The user who posted the comment." },
      {
        key: "organizationId",
        type: "string",
        description: "The record's org scope, or null for platform-tier.",
      },
    ],
  },
} as const;

export function registerDataModelsEventTypes(): void {
  registerEventTypes("data-models", DATA_MODELS_EVENT_TYPES);
}
