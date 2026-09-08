import { registerPermissions } from "@monark/rbac/server";

// Schema-editing permissions govern *shape* (Data Models + their fields) ;
// record permissions govern the *data* inside them. Row-level visibility is a
// separate axis: `DataRecordRoleAccess` restricts individual records, and
// `view-all-records` is the capability that ignores those restrictions. It is
// deliberately NOT implied by `manage-schema` — designing a schema and reading
// every row in it are different powers (see identity-and-integration.md). Keys use
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
  "view-all-records": {
    description:
      "See every Data Record, ignoring per-record role restrictions. Held by admins by default. Revoke it from a role that should design schemas but not read restricted rows (HR, payroll, legal).",
    category: "data-models",
  },
  "manage-forms": {
    description:
      "Create and manage public forms (shareable links + email invites) that let non-users submit records to a Data Model.",
    category: "data-models",
  },
} as const;

export function registerDataModelsPermissions(): void {
  registerPermissions("data-models", DATA_MODELS_PERMISSIONS);
}
