import { registerPermissions } from "@monark/rbac/server";

// Schema-editing permissions govern *shape* (Data Models + their fields) ;
// record permissions govern the *data* inside them, model-wide (not per-row
// — see the spec's "Deferred" section for the per-row follow-up). Keys use
// hyphens, not dots — the rbac registry's KEY_RE forbids "." inside a key,
// so "record.read" isn't representable ; "record-read" is.
const DATA_MODELS_PERMISSIONS = {
  "manage-schema": {
    description:
      "Create, edit, reorder, and archive Data Models and their fields, and configure module integrations.",
    category: "data-models",
  },
  "read-schema": {
    description: "Read Data Model and field definitions.",
    category: "data-models",
  },
  "record-read": {
    description: "Read Data Records.",
    category: "data-models",
  },
  "record-write": {
    description: "Create or edit Data Records.",
    category: "data-models",
  },
  "record-bulk-write": {
    description:
      "Edit many Data Records at once (bulk edit). Separate from single-record editing, and additional to it — a bulk edit still requires record-write on the model.",
    category: "data-models",
  },
  "record-delete": {
    description: "Soft-delete or hard-delete Data Records.",
    category: "data-models",
  },
} as const;

export function registerDataModelsPermissions(): void {
  registerPermissions("data-models", DATA_MODELS_PERMISSIONS);
}
