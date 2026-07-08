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

**Every Data Model is org-scoped.** `DataModel.organizationId: string` (non-null) — platform-wide (null-org) models are disallowed. Key uniqueness is per-org and scoped to LIVE rows only, so a soft-deleted model frees its key for reuse. Prisma's `@@unique` can't express that NULL-aware condition, so it's a hand-written partial index rather than a schema `@@unique`:

```sql
CREATE UNIQUE INDEX "DataModel_org_key_active_unique"
  ON "DataModel" ("organizationId", "key") WHERE "deletedAt" IS NULL;
```

Every model create/access check resolves the caller's active org (`requireOrg`) and gates on `requirePermission(ctx, "data-models.manage-schema", org.id)`. There is no platform namespace and no `scope` input — `models.create` always writes `organizationId = org.id`, and `models.getByKey` / `resolveDataModelByKey` resolve a key within the caller's org alone. (Historically `organizationId` was nullable, with `null` meaning platform-wide to mirror `Industry`; the [20260707050000_data_models_org_required](../db/prisma/migrations/20260707050000_data_models_org_required/migration.sql) migration re-parented any null-org models + records to the singleton org and made the column NOT NULL, and [20260707060000_data_models_key_unique_partial](../db/prisma/migrations/20260707060000_data_models_key_unique_partial/migration.sql) restored the soft-delete-frees-the-key partial unique.)

**Each model auto-integrates into RBAC + webhooks as it's created.** On create (and refreshed on rename), a model registers three per-model record permissions — `data-models.<key>-record-{read,write,delete}` — and three per-model event types — `data-models.<key>-record-{created,updated,deleted}` — grouped under `Data Model: <name>` in the `/admin/rbac` catalog and the webhook subscription picker. `requireModelAccess` accepts EITHER the per-model permission OR the generic `data-models.record-*` (admins short-circuit both), so a role can be granted just one model's records without the blanket grant, and existing grants keep working. The engine still emits the generic `data-models.record-*` event ; it carries the per-model type as `DomainEventBase.subscriptionAliases` so the webhooks matcher routes the generic emit to a per-model subscription (per-model event _literals_ can't join the codegen'd `DomainEvent` union, hence the registry + alias split). Both registries are in-memory ; `hydrateDataModelRegistrations()` re-walks every live model at api boot to rebuild them after a restart. See [server/registrations.ts](src/server/registrations.ts).

**Multi-tenant-safe by an org-scoped visibility layer.** The per-model entries are globally registered (so `isKnownPermission` + grant-time validation pass, and the picker has their metadata) but marked `orgScoped`. The two display readers — `/admin/rbac`'s `adminListPermissions` and `webhooks.listEventTypes` — only SHOW an org the org-scoped entries a registered visibility resolver reports for it. `registerDataModelVisibilityResolvers()` (wired at boot) registers resolvers returning exactly the caller-org's LIVE models' keys, so one org never sees another org's model keys — even though the registry entry is shared (two orgs with a `project` model map to the single `data-models.project-record-read`, which is correct: enforcement scopes by the model's org, and a shared key stays grantable wherever the model exists). The generic hooks live in `@monark/rbac` (`registerOrgScopedPermissionVisibility`) and `@monark/common` (`registerOrgScopedEventTypeVisibility`), keeping those packages ignorant of `data-models`.

**One validation implementation, shared client/server.** `valueSchemaFor` (in `/contracts/field-types.ts`) builds the zod fragment that validates one field's _value_, given a structural `DataFieldValueShape` (type + the config properties that affect validation) and optional message overrides. `services/web/src/components/fields/schema.ts`'s `schemaFor` is a thin adapter from the client's `FieldDef` onto this same function — the server (no i18n, messages omitted) and the client (localized `FieldMessages` passed in) share one implementation instead of two hand-synced ones. `valueSchemaForField(type, config, required)` is the server-facing entry point that also validates the field's persisted `config` against `fieldConfigSchemas[type]` first.

**Field keys are immutable JSON property names.** `DataField.key` (`^[a-z][a-z0-9_]*$`) is the literal key inside every `DataRecord.data` blob for that field — renaming it would silently orphan existing values, so the API only ever offers a `label` edit after create. `DataModel.key` is a separate, dash-case machine name (`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`) used as a route segment, matching the `Organization` / `Project` slug shape.

**Archiving, not deleting, a field.** `DataField.archivedAt` hides a field from the create/edit form and column picker, but past records' values under that key stay readable — deleting a field definition outright would make historical `DataRecord.data` unparseable against the current schema.

**A record's title is denormalized and recomputed on every write.** `DataModel.titleFieldId` names which field backs `DataRecord.title` (falls back to `"Untitled"` when unset, or when the derived value is empty). `RICH_TEXT` title values are stripped to plain text via `stripHtmlTags` before deriving. `update` re-validates the _full_ merged object (existing `data` overlaid with the patch), not just the patched keys, so a partial edit can't silently leave a required field's constraint violated.

**Record access is two-layered : per-model permission, then per-record role access.** _Model layer_ — a record op gates on the per-model `data-models.<key>-record-<verb>` OR the generic `data-models.record-<verb>` (admins short-circuit) : can you touch this model's records at all. _Row layer_ — within a model you can access, a `DataRecord` with no `DataRecordRoleAccess` rows is visible to everyone (the default, fully backward-compatible) ; with rows, only those roles may read/edit/delete it. A restricted record is a **404** (not 403) for callers whose roles aren't listed, so its existence doesn't leak. Data admins (`data-models.manage-schema`, which ADMIN/SYSADMIN short-circuit) bypass the row layer ; note a blanket `data-models.record-read` does **not** bypass it — row-level is real privacy, not overridden by "read all". The filter mirrors `CalendarRoleAccess` (`server/data.ts`'s `recordRoleAccessWhere`). Set a record's access with `records.setAccess` ; read it with `records.getAccess`.

**Mapping, not reserved field keys, for module integrations.** A module (e.g. `@monark/calendar`) declares named "slots" it needs — a type constraint, whether it's required, and (for `RELATION`) a `relationTarget` — via `registerModelIntegration(module, { slots, description })` at boot, mirroring the `registerPermissions`/`registerFlags` idiom. An admin then maps their own Data Model's fields onto those slots per-model (`DataModelIntegration.slotMappings`, a `slotKey -> DataField.id` map), validated by `upsertModelIntegration` against the registry (unknown module, wrong field type, mismatched `relationTarget`, or a required slot left unmapped while `enabled: true` are all rejected). Nothing here assumes any particular field key name — an admin free to name their own fields however they like, which is the whole point : reserved key names would force a fixed vocabulary onto a no-code surface and can't express "which of two date fields" or a relation-shaped requirement like "which calendar" at all.

**Dates round-trip through JSONB as strings, not `Date` instances.** `DataRecord.data` is JSON, which has no native Date type — a `Date` written on create comes back as an ISO string on the next read (e.g. inside `updateDataRecord`'s re-validation of the merged object). `valueSchemaFor`'s `DATE`/`DATETIME` branch preprocesses either a `Date` or a valid date string into a `Date` before validating, so both the client (real `Date` objects from a date picker) and the server (strings read back from storage) validate correctly and get a `Date` back from `.parse()`.

**Per-field indexing is opt-in, not automatic.** The baseline GIN index on `DataRecord.data` (added in the first migration) makes every field filterable _correctly_ from day one, but a fast query plan on a hot field at scale needs a real expression index. `fields.requestIndex` (`server/indexing.ts`) provisions one on demand : a B-tree over the extracted-and-cast value for scalar types (`((data->>'key')::numeric)` for `NUMBER`, `::boolean` for `BOOLEAN`, `::timestamptz` for `DATE`/`DATETIME`, plain text for everything else), or a GIN over the raw jsonb array for `MULTI_SELECT`/`RELATION`. `CREATE INDEX CONCURRENTLY` can't run inside a transaction and can take a while on a large table, so `requestFieldIndex` returns immediately with `"pending"` and the build runs fire-and-forget in the background ; poll `fields.indexStatus` or `DataField.indexed` to know when it lands. Idempotent : a field already `pending`/`building`/`ready` short-circuits, and `CREATE INDEX CONCURRENTLY IF NOT EXISTS` covers the remaining race. The field's `key` and both its id and its model's id are re-validated against a strict regex immediately before use, since none of this DDL has a parameterized form for identifiers or jsonb paths — interpolating them directly is only safe because they're already validated at field-creation time and never come straight from request input at this layer.

## tRPC procedures

All procedures are under `trpc.dataModels.*`.

| Procedure                    | Permission                  | Notes                                                                         |
| ---------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `models.list`                | `data-models.read-schema`   | Caller's org models, cursor-paginated                                         |
| `models.getById`             | `data-models.read-schema`   |                                                                               |
| `models.getByKey`            | `data-models.read-schema`   | Resolves `key` within the caller's active org                                 |
| `models.create`              | `data-models.manage-schema` | Always org-scoped to the caller's active org                                  |
| `models.update`              | `data-models.manage-schema` | name / description / icon / `titleFieldId`                                    |
| `models.delete`              | `data-models.manage-schema` | soft by default ; `hard: true` permanently removes                            |
| `models.restore`             | `data-models.manage-schema` |                                                                               |
| `fields.list`                | `data-models.read-schema`   | ordered by `position` ; not paginated (bounded per model)                     |
| `fields.create`              | `data-models.manage-schema` | validates `config` against `fieldConfigSchemas[type]`                         |
| `fields.update`              | `data-models.manage-schema` | `type` is immutable after create                                              |
| `fields.reorder`             | `data-models.manage-schema` | full-list reorder ; rejects a partial/mismatched id set                       |
| `fields.archive`             | `data-models.manage-schema` | clears `titleFieldId` if the archived field backed it                         |
| `fields.unarchive`           | `data-models.manage-schema` |                                                                               |
| `fields.requestIndex`        | `data-models.manage-schema` | provisions an expression index in the background ; returns immediately        |
| `fields.indexStatus`         | `data-models.read-schema`   | `pending \| building \| ready \| failed`, or `null` if never requested        |
| `records.list`               | `data-models.record-read`   | per-model `<key>-record-read` OR generic (all record rows) + row-level filter |
| `records.getById`            | `data-models.record-read`   | 404 if the record is role-restricted and the caller lacks a listed role       |
| `records.create`             | `data-models.record-write`  | `data` validated against the model's active fields                            |
| `records.update`             | `data-models.record-write`  | partial `data` merge, re-validated in full ; row-level access enforced        |
| `records.delete`             | `data-models.record-delete` | soft by default ; `hard: true` permanently removes ; row-level enforced       |
| `records.restore`            | `data-models.record-write`  | mirrors `projects.restore` / `industries.restore` (write, not delete)         |
| `records.getAccess`          | `data-models.manage-schema` | the role ids allowed to see a record (empty = open to all model-accessors)    |
| `records.setAccess`          | `data-models.manage-schema` | replace a record's role-access list wholesale                                 |
| `integrations.listAvailable` | `data-models.read-schema`   | reads the in-memory registry, no DB ; every registered module's slot catalog  |
| `integrations.get`           | `data-models.read-schema`   | a model's saved `DataModelIntegration` rows, one per module                   |
| `integrations.save`          | `data-models.manage-schema` | validates `slotMappings` against the module's registered slots                |

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

The admin schema builder ([admin/data-models/[id]/model-editor.tsx](<../../services/web/src/app/(authed)/admin/data-models/[id]/model-editor.tsx>)) is built : model settings + title-field, full field CRUD with drag-reorder, per-type config for all 12 field types ([field-editor-dialog.tsx](<../../services/web/src/app/(authed)/admin/data-models/[id]/field-editor-dialog.tsx>)), the "indexed" badge + `fields.requestIndex` affordance, and the `DataModelIntegration` slot-mapping section. The generic record list/detail UI ([data/models/[modelKey]](<../../services/web/src/app/(authed)/data/models>)) is built on `services/web/src/components/fields`.

## Deferred

- **`SELECT` / `MULTI_SELECT` option colors.** The config schema accepts a `color` per option, but the field editor doesn't offer a color picker yet ; options render without a swatch.
- **Per-record access UI.** Row-level authorization (`DataRecordRoleAccess`) is enforced server-side and managed via `records.getAccess` / `records.setAccess`, but there's no admin UI yet to pick which roles can see a record — the record detail panel needs an "Access" control (mirroring the calendar role picker).
- **Registry hygiene on hard delete.** A hard-deleted model's global registry entries linger until the next boot re-hydrates only live models. It's already hidden from every org's picker the moment the model is gone (the visibility resolver drops it), so this is cosmetic — the entry just isn't garbage-collected until restart.
