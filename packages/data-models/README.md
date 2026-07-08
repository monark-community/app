# @monark/data-models

Admin-configurable, polymorphic "Data Model" engine (Notion-Databases style). Sysadmins define their own record types (name + fields + types + limits) at runtime, with no app code change or deploy. `Project` and `Industry` are planned to migrate onto this engine as its first two models ; that cutover is a later phase (see the spec).

Spec: [docs/features-planning/phase-2/polymorphic-db.md](../../docs/features-planning/phase-2/polymorphic-db.md).

**Status: schema + record CRUD + module integrations + per-field indexing, no UI yet.** This phase ships `DataModel` + `DataField` + `DataRecord` CRUD, RBAC, the `registerModelIntegration` registry (consumed by `@monark/calendar`'s materialization subscriber), and opt-in per-field expression indexing. The admin/record UI and the Project/Industry cutover are later phases — see the spec's rollout order.

## What's here

- `/contracts` — `DATA_FIELD_TYPES` / `DataFieldType` (mirrors the Prisma enum), `fieldConfigSchemas` (per-type `DataField.config` shape), `valueSchemaFor` / `valueSchemaForField` / `stripHtmlTags` (the shared record-value zod builder — see "Key concepts"), `registerModelIntegration` / `listModelIntegrations` / `getModelIntegrationDef` (the integration-slot registry — see "Key concepts"), and `DataModelsEvents`.
- `/server` — Prisma data layer (`data.ts`: models + fields + records + model-integrations CRUD, key/slug derivation and collision helpers, title derivation), `data-models.{manage-schema,read-schema,record-read,record-write,record-delete}` permissions (`permissions.ts`), the `dataModelsRouter` tRPC sub-router (`router.ts`), and event-type registration (`event-types.ts`).
- `/client` — placeholder ; the admin schema-builder UI and the generic record list/detail UI land in a later phase, built on the existing `services/web/src/components/fields` toolkit.

Prisma models live under `// ── MODULE: data-models ──` in `packages/db/prisma/schema.prisma`: `DataModel`, `DataField`, `DataRecord`, `DataModelIntegration`, `DataFieldIndex`. Migration `20260706000312_add_data_models`.

## Key concepts

**Hybrid storage.** Fixed, indexed Postgres columns for the system envelope (`id`, `organizationId`, `key`/`slug`, `title`, timestamps) + a single JSONB `data` column on `DataRecord` for admin-defined field values, namespaced by `DataField.key`. Avoids both a full EAV join-per-field design and a bespoke-columns-per-model design. See the spec's "Data model" and "Edge cases & risks" sections for the tradeoffs this accepts (relation fields have no real FK ; fast filtering on a hot field is opt-in via `DataFieldIndex`, not automatic for every field).

**Every Data Model is org-scoped.** `DataModel.organizationId: string` (non-null) — platform-wide (null-org) models are disallowed. Key uniqueness within an org is a plain `@@unique([organizationId, key])`, so no NULL-aware partial index is needed:

```prisma
@@unique([organizationId, key])
```

Every model create/access check resolves the caller's active org (`requireOrg`) and gates on `requirePermission(ctx, "data-models.manage-schema", org.id)`. There is no platform namespace and no `scope` input — `models.create` always writes `organizationId = org.id`, and `models.getByKey` / `resolveDataModelByKey` resolve a key within the caller's org alone. (Historically `organizationId` was nullable, with `null` meaning platform-wide to mirror `Industry`; the [20260707050000_data_models_org_required](../db/prisma/migrations/20260707050000_data_models_org_required/migration.sql) migration re-parented any null-org models + records to the singleton org and made the column NOT NULL.)

**One validation implementation, shared client/server.** `valueSchemaFor` (in `/contracts/field-types.ts`) builds the zod fragment that validates one field's _value_, given a structural `DataFieldValueShape` (type + the config properties that affect validation) and optional message overrides. `services/web/src/components/fields/schema.ts`'s `schemaFor` is a thin adapter from the client's `FieldDef` onto this same function — the server (no i18n, messages omitted) and the client (localized `FieldMessages` passed in) share one implementation instead of two hand-synced ones. `valueSchemaForField(type, config, required)` is the server-facing entry point that also validates the field's persisted `config` against `fieldConfigSchemas[type]` first.

**Field keys are immutable JSON property names.** `DataField.key` (`^[a-z][a-z0-9_]*$`) is the literal key inside every `DataRecord.data` blob for that field — renaming it would silently orphan existing values, so the API only ever offers a `label` edit after create. `DataModel.key` is a separate, dash-case machine name (`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`) used as a route segment, matching the `Organization` / `Project` slug shape.

**Archiving, not deleting, a field.** `DataField.archivedAt` hides a field from the create/edit form and column picker, but past records' values under that key stay readable — deleting a field definition outright would make historical `DataRecord.data` unparseable against the current schema.

**A record's title is denormalized and recomputed on every write.** `DataModel.titleFieldId` names which field backs `DataRecord.title` (falls back to `"Untitled"` when unset, or when the derived value is empty). `RICH_TEXT` title values are stripped to plain text via `stripHtmlTags` before deriving. `update` re-validates the _full_ merged object (existing `data` overlaid with the patch), not just the patched keys, so a partial edit can't silently leave a required field's constraint violated.

**Record permissions are model-wide, not per-row, in v1.** `data-models.record-{read,write,delete}` gate every record under a Data Model uniformly ; there's no way yet to grant access to a subset of records within one model. See "Deferred" for the per-row follow-up.

**Mapping, not reserved field keys, for module integrations.** A module (e.g. `@monark/calendar`) declares named "slots" it needs — a type constraint, whether it's required, and (for `RELATION`) a `relationTarget` — via `registerModelIntegration(module, { slots, description })` at boot, mirroring the `registerPermissions`/`registerFlags` idiom. An admin then maps their own Data Model's fields onto those slots per-model (`DataModelIntegration.slotMappings`, a `slotKey -> DataField.id` map), validated by `upsertModelIntegration` against the registry (unknown module, wrong field type, mismatched `relationTarget`, or a required slot left unmapped while `enabled: true` are all rejected). Nothing here assumes any particular field key name — an admin free to name their own fields however they like, which is the whole point : reserved key names would force a fixed vocabulary onto a no-code surface and can't express "which of two date fields" or a relation-shaped requirement like "which calendar" at all.

**Dates round-trip through JSONB as strings, not `Date` instances.** `DataRecord.data` is JSON, which has no native Date type — a `Date` written on create comes back as an ISO string on the next read (e.g. inside `updateDataRecord`'s re-validation of the merged object). `valueSchemaFor`'s `DATE`/`DATETIME` branch preprocesses either a `Date` or a valid date string into a `Date` before validating, so both the client (real `Date` objects from a date picker) and the server (strings read back from storage) validate correctly and get a `Date` back from `.parse()`.

**Per-field indexing is opt-in, not automatic.** The baseline GIN index on `DataRecord.data` (added in the first migration) makes every field filterable _correctly_ from day one, but a fast query plan on a hot field at scale needs a real expression index. `fields.requestIndex` (`server/indexing.ts`) provisions one on demand : a B-tree over the extracted-and-cast value for scalar types (`((data->>'key')::numeric)` for `NUMBER`, `::boolean` for `BOOLEAN`, `::timestamptz` for `DATE`/`DATETIME`, plain text for everything else), or a GIN over the raw jsonb array for `MULTI_SELECT`/`RELATION`. `CREATE INDEX CONCURRENTLY` can't run inside a transaction and can take a while on a large table, so `requestFieldIndex` returns immediately with `"pending"` and the build runs fire-and-forget in the background ; poll `fields.indexStatus` or `DataField.indexed` to know when it lands. Idempotent : a field already `pending`/`building`/`ready` short-circuits, and `CREATE INDEX CONCURRENTLY IF NOT EXISTS` covers the remaining race. The field's `key` and both its id and its model's id are re-validated against a strict regex immediately before use, since none of this DDL has a parameterized form for identifiers or jsonb paths — interpolating them directly is only safe because they're already validated at field-creation time and never come straight from request input at this layer.

## tRPC procedures

All procedures are under `trpc.dataModels.*`.

| Procedure                    | Permission                  | Notes                                                                        |
| ---------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `models.list`                | `data-models.read-schema`   | Caller's org models, cursor-paginated                                        |
| `models.getById`             | `data-models.read-schema`   |                                                                              |
| `models.getByKey`            | `data-models.read-schema`   | Resolves `key` within the caller's active org                                |
| `models.create`              | `data-models.manage-schema` | Always org-scoped to the caller's active org                                 |
| `models.update`              | `data-models.manage-schema` | name / description / icon / `titleFieldId`                                   |
| `models.delete`              | `data-models.manage-schema` | soft by default ; `hard: true` permanently removes                           |
| `models.restore`             | `data-models.manage-schema` |                                                                              |
| `fields.list`                | `data-models.read-schema`   | ordered by `position` ; not paginated (bounded per model)                    |
| `fields.create`              | `data-models.manage-schema` | validates `config` against `fieldConfigSchemas[type]`                        |
| `fields.update`              | `data-models.manage-schema` | `type` is immutable after create                                             |
| `fields.reorder`             | `data-models.manage-schema` | full-list reorder ; rejects a partial/mismatched id set                      |
| `fields.archive`             | `data-models.manage-schema` | clears `titleFieldId` if the archived field backed it                        |
| `fields.unarchive`           | `data-models.manage-schema` |                                                                              |
| `fields.requestIndex`        | `data-models.manage-schema` | provisions an expression index in the background ; returns immediately       |
| `fields.indexStatus`         | `data-models.read-schema`   | `pending \| building \| ready \| failed`, or `null` if never requested       |
| `records.list`               | `data-models.record-read`   | cursor-paginated ; searches `title` + `slug`                                 |
| `records.getById`            | `data-models.record-read`   |                                                                              |
| `records.create`             | `data-models.record-write`  | `data` validated against the model's active fields                           |
| `records.update`             | `data-models.record-write`  | partial `data` merge, re-validated in full ; recomputes `title`              |
| `records.delete`             | `data-models.record-delete` | soft by default ; `hard: true` permanently removes                           |
| `records.restore`            | `data-models.record-write`  | mirrors `projects.restore` / `industries.restore` (write, not delete)        |
| `integrations.listAvailable` | `data-models.read-schema`   | reads the in-memory registry, no DB ; every registered module's slot catalog |
| `integrations.get`           | `data-models.read-schema`   | a model's saved `DataModelIntegration` rows, one per module                  |
| `integrations.save`          | `data-models.manage-schema` | validates `slotMappings` against the module's registered slots               |

## Usage

```ts
// Server-side, another module reading the field-value contract:
import { valueSchemaForField } from "@monark/data-models/contracts";

const schema = valueSchemaForField(field.type, field.config, field.required);
const value = schema.parse(input.data[field.key]);
```

```ts
// A module declaring its integration slots at boot (e.g. @monark/calendar's
// packages/calendar/src/server/model-integration.ts):
import { registerModelIntegration } from "@monark/data-models/server";

registerModelIntegration("calendar", {
  description: "Materializes a Data Record onto a Calendar as a real CalendarEvent.",
  slots: {
    time: { types: ["DATE", "DATETIME"], required: true, description: "..." },
    calendarRef: {
      types: ["RELATION"],
      relationTarget: "Calendar",
      required: true,
      description: "...",
    },
  },
});
```

```ts
// Boot wiring (services/api/src/server.ts), alongside the other register* calls:
import {
  registerDataModelsPermissions,
  registerDataModelsEventTypes,
} from "@monark/data-models/server";

registerDataModelsPermissions();
registerDataModelsEventTypes();
```

## Dependencies

- `@monark/db` (Prisma)
- `@monark/common` (event bus, errors, tRPC primitives, pagination)
- `@monark/organizations` (`requireOrg`)
- `@monark/rbac` (`requirePermission`)

Core tier — every org needs the engine, and it must be depended on by other modules (`@monark/calendar`'s materialization subscriber, and temporarily `@monark/projects`'s planned compatibility shim), which an extended-tier module can't provide for another extended module.

## Events emitted

| Event                        | When                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-models.schema-changed` | A `DataModel`, `DataField`, or `DataModelIntegration` is created, edited, reordered, or saved (`kind: "model" \| "field" \| "integration"`) |
| `data-models.record-created` | A new `DataRecord` was created                                                                                                              |
| `data-models.record-updated` | A `DataRecord`'s fields, title, or slug changed ; `changed` carries the `DataField.key`s + `title`/`slug`                                   |
| `data-models.record-deleted` | A `DataRecord` was soft-deleted (`hard: false`) or hard-deleted (`hard: true`)                                                              |

Both carry `dataModelKey` alongside `dataModelId` so a subscriber (e.g. Calendar's materialization subscriber) can filter by model without a round-trip lookup.

## Events consumed

None yet. (`@monark/calendar` is the first consumer of `data-models.record-*` — see its README's "Events consumed".)

## Deferred

- **`DataModelIntegration` admin UI** — the registry, server CRUD, and validation exist ; there's no schema-builder tab to configure a mapping yet.
- **Admin schema-builder UI** (including an "indexed" badge / index-request affordance for `fields.requestIndex`) and the **generic record list/detail UI** (built on `services/web/src/components/fields`).
- **Per-row (record-level) authorization** (`DataModelRoleAccess`, mirroring `CalendarRoleAccess`) — record access is model-wide in v1.
