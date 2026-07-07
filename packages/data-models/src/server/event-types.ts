import { registerEventTypes } from "@monark/common";

const DATA_MODELS_EVENT_TYPES = {
  "data-models.schema-changed": {
    description: "A Data Model or one of its fields was created, edited, reordered, or archived.",
  },
  "data-models.record-created": {
    description: "A new Data Record was created.",
  },
  "data-models.record-updated": {
    description: "A Data Record's fields, title, or slug changed.",
  },
  "data-models.record-deleted": {
    description: "A Data Record was soft-deleted (`hard: false`) or hard-deleted (`hard: true`).",
  },
} as const;

export function registerDataModelsEventTypes(): void {
  registerEventTypes("data-models", DATA_MODELS_EVENT_TYPES);
}
