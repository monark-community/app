# Configurable / Polymorphic Data Models

## Context

`Project` and `Industry` are hardcoded Prisma models today (`packages/projects`, the app's only "extended" tier module). Every new data shape a sysadmin needs — a new record type, a new field, a new limit — requires an app code change, a migration, and a deploy. That doesn't scale with how the platform's data needs will evolve.

The goal is a Notion-Databases-style engine: admins define their own "Data Models" (name + fields + types + limits) at runtime, with no app code change required. `Project` and `Industry` become the first two models migrated onto it — a full cutover, retiring their dedicated tables once verified.

A key design question going in was how admin-defined models plug into platform features like the Calendar (which itself supports multiple calendars per org). The answer is **mapping, not reserved field keys**: system envelope columns (`id`, `created_at`, `deleted_at`, `slug`, etc.) are always-present columns outside the custom-field namespace — there's nothing to reserve for them in the first place. For genuinely business-shaped integrations (Calendar's "which field is the date", "which calendar this belongs to"), each Data Model gets an explicit, admin-configured mapping from its own fields into named "slots" that a consuming module registers — the same `register<Thing>(module, defs)` idiom the codebase already uses for permissions and feature flags. Reserved key names would force English/technical vocabulary onto a no-code surface, can't express "which of two date fields on this model", and can't express a relation-shaped requirement ("which calendar") at all — so mapping is used consistently rather than mixing two mechanisms.

The codebase already has strong precedent to build on: five `register<Thing>(module, defs)` extension points (permissions, flags, notification kinds, domain events, event-type registry — see `docs/technical-documentation/extensibility-contract.md`), a JSON "metadata sidecar" (`UserMetadata`/`OrganizationMetadata`) explicitly documented as the stepping stone to richer per-module data, a `DataTable`/`FilterBar`/`TableDetailLayout` pattern library documented in `app/CLAUDE.md` as the standard admin list/detail shell (now with cursor pagination baked in via `@monark/common/pagination` + `usePaginatedList`), and — most directly — the `services/web/src/components/fields` toolkit: a descriptor-driven `FieldDef` registry with a schema-driven `AutoForm` (`react-hook-form` + `zodResolver`) and matching table cells, built explicitly for this migration. Much of what reads below as "to build" for the record UI already exists there; the plan reuses it rather than starting fresh.

## Goals

- Sysadmins can create a new Data Model (name, description, icon), add/reorder/edit fields with a type and per-type limits, and designate one field as the record's title, entirely through an admin UI — no deploy.
- Field types cover: text, long text, rich text (WYSIWYG / sanitized HTML — Industry's description depends on it), number, boolean, date, datetime, single-select, multi-select (with an optional "allow custom values" mode), relation (to another Data Model or a fixed system model), URL, email.
- Records of a Data Model support fast filter/sort/group by any field in a table view (Notion-level query power), with a documented, deliberate path for admins to opt hot fields into a real Postgres index.
- A module (e.g. Calendar) can declare integration "slots" it needs (e.g. a start time, a target calendar); an admin maps their own Data Model's fields into those slots per-model, with type-checked validation at save time.
- The Calendar integration materializes into real `CalendarEvent` rows (not a live read of arbitrary JSON at query time), so Calendar's existing day-view/reminder infrastructure needs zero changes.
- `Project` and `Industry`'s existing production data is migrated onto the new engine and their dedicated Prisma tables are retired, with a safe, reversible rollback window before the drop.
- Existing `/projects`, `/industries` routes and their `projects.*`/`industries.*` tRPC surface and domain events keep working, unchanged, for the length of the migration window.

## Non-goals

- No formula/rollup/computed fields in v1 (Notion has these; deliberately deferred).
- No per-row (record-level) authorization in v1 — record access is model-wide (`data-models.record.{read,write,delete}`), matching `Project`/`Industry`'s current lack of row-level RBAC. Structured so a future `DataModelRoleAccess` join table (mirroring the existing `CalendarRoleAccess` precedent) can be added additively later.
- No real foreign-key/referential integrity for relation-type fields at the database level — target ids are stored inside the record's JSON payload. Fine at hundreds-to-low-thousands of rows per model; not a substitute for a real relational join at high scale. Documented as a known limitation, not solved in v1.
- No moving a Data Model between platform-wide and org-scoped after creation.
- No permanent bridge for legacy `project.*`/`industry.*` webhook events past the migration window — there are no external consumers of them today, so they retire once the compatibility shim is deleted.

## User stories

- **As a sysadmin**, I can create a new Data Model, add fields with types and limits, and start creating records — without asking engineering for a code change.
- **As a sysadmin**, I can designate which field is a model's "title" so it shows correctly in list views and links.
- **As a sysadmin**, I can configure a Data Model to appear on the Calendar by mapping one of its date fields and a relation field to Calendar's required slots.
- **As an org member with the right permission**, I can browse, filter, sort, and edit records of a Data Model in a table + detail-panel view, the same way I browse Projects today.
- **As a developer**, existing `trpc.projects.*` calls and `project.*` webhook subscriptions keep working during the migration, so I don't have to coordinate a hard cutover.

## Data model

Hybrid storage: fixed, indexed Postgres columns for the system envelope + a JSONB payload for admin-defined field values. New banner in `packages/db/prisma/schema.prisma`, alongside `// ── MODULE: data-models ──`:

```prisma
enum DataFieldType {
  TEXT
  LONG_TEXT
  RICH_TEXT
  NUMBER
  BOOLEAN
  DATE
  DATETIME
  SELECT
  MULTI_SELECT
  RELATION
  URL
  EMAIL
}
```

`RICH_TEXT` is not optional : `Industry.description` is already a `richText`
field today (Tiptap WYSIWYG, stores sanitized HTML), so without this variant
the Industry migration has nowhere to put its description. `LONG_TEXT` is plain
text and cannot substitute. These 12 variants map **1:1** onto the existing
`components/fields` `FieldDef` union (see the note under "UI flows" below) :

| `DataFieldType` | `FieldDef.type` |
| --------------- | --------------- |
| `TEXT`          | `text`          |
| `LONG_TEXT`     | `longText`      |
| `RICH_TEXT`     | `richText`      |
| `NUMBER`        | `number`        |
| `BOOLEAN`       | `boolean`       |
| `DATE`          | `date`          |
| `DATETIME`      | `datetime`      |
| `SELECT`        | `singleSelect`  |
| `MULTI_SELECT`  | `multiSelect`   |
| `RELATION`      | `relation`      |
| `URL`           | `url`           |
| `EMAIL`         | `email`         |

```prisma
// enum DataFieldType is declared above

model DataModel {
  id             String    @id @default(cuid())
  organizationId String?                          // null = platform-wide (Industry's semantics today)
  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  key            String                            // immutable machine name
  name           String
  description    String?
  icon           String?
  titleFieldId   String?                           // which DataField backs the record title

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?
  createdBy      String

  fields         DataField[]
  records        DataRecord[]
  integrations   DataModelIntegration[]

  @@index([organizationId])
  @@index([deletedAt])
  // NULL-aware partial-unique indexes on (organizationId?, key) added via
  // hand-written migration SQL — Prisma's @@unique can't express the WHERE.
}

model DataField {
  id           String        @id @default(cuid())
  dataModelId  String
  dataModel    DataModel     @relation(fields: [dataModelId], references: [id], onDelete: Cascade)

  key          String        // immutable, ^[a-z][a-z0-9_]*$ — the JSON key inside DataRecord.data
  label        String
  description  String?
  type         DataFieldType
  config       Json          @default("{}")        // per-type shape, see "Field-type system" below
  required     Boolean       @default(false)
  position     Int           @default(0)
  indexed      Boolean       @default(false)        // has a provisioned expression index

  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  archivedAt   DateTime?                             // archived, not deleted — historical values stay readable

  @@unique([dataModelId, key])
  @@index([dataModelId, archivedAt])
}

model DataRecord {
  id             String     @id @default(cuid())
  dataModelId    String
  dataModel      DataModel  @relation(fields: [dataModelId], references: [id], onDelete: Cascade)
  organizationId String?                             // denormalized from DataModel.organizationId
  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  slug           String?
  title          String                              // denormalized from the title field's value
  data           Json       @default("{}")

  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  deletedAt      DateTime?
  createdBy      String

  @@index([dataModelId, deletedAt])
  @@index([organizationId, dataModelId])
  @@index([dataModelId, updatedAt])
  // Partial-unique (dataModelId, slug) WHERE slug IS NOT NULL, added via migration SQL.
}

model DataModelIntegration {
  id            String    @id @default(cuid())
  dataModelId   String
  dataModel     DataModel @relation(fields: [dataModelId], references: [id], onDelete: Cascade)
  module        String                                // e.g. "calendar"
  slotMappings  Json                                   // Record<slotKey, DataField.id>
  enabled       Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([dataModelId, module])
  @@index([module])
}

model DataFieldIndex {
  id          String   @id @default(cuid())
  dataFieldId String   @unique
  indexName   String   @unique
  status      String                                   // pending | building | ready | failed
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Additive columns on the existing `CalendarEvent` model (small, core-owned change) to support materialized integration records:

```prisma
model CalendarEvent {
  // ...existing fields unchanged...
  sourceModule   String?
  sourceRecordId String?

  @@unique([sourceModule, sourceRecordId])
}
```

### Field-type system

`packages/data-models/src/contracts/field-types.ts` is the single source of truth: a zod config schema per `DataFieldType` (min/max/pattern for TEXT, `options` for SELECT/MULTI*SELECT, `relationTarget`+`relationTargetKind`+`cardinality` for RELATION, `allowCustomValues` for MULTI_SELECT) and a `valueSchemaFor(type, config, required)` function that builds the zod schema for a \_record's* value at that field. Both the tRPC record-write input (server) and the dynamic form's `zodResolver` (client) import this same function — one implementation, not two hand-synced ones, unlike today's hand-rolled Project/Industry forms where client and server validation drift independently.

**Lift, don't re-implement.** `services/web/src/components/fields/schema.ts` already has this logic client-side as `schemaFor(def, messages)`. `valueSchemaFor` is that function moved into the shared `contracts/` package and split at the one seam that keeps it usable on both sides: it emits **structural** zod only (no i18n) — the server uses it as-is at the tRPC boundary, and the client fields layer wraps it to attach localized messages from `useFieldStrings()`. Do not write a second copy in `field-types.ts`; port the existing one and delete the client original.

### Indexing strategy (the "fast filter/sort by any field" requirement)

- System envelope columns are real, individually-indexed Postgres columns — fast by default for the primary column, default sort, and org/model scoping.
- A baseline `CREATE INDEX ... USING GIN (data jsonb_path_ops)` on `DataRecord.data` makes every field filterable correctly from day one.
- Opt-in per-field expression indexes (`CREATE INDEX CONCURRENTLY` on `(data->>'key')`, cast per type) are provisioned on demand when an admin flags a field as hot, via a server-side raw-SQL executor (`packages/data-models/src/server/indexing.ts`), tracked in `DataFieldIndex` so the admin UI can show an "indexed" badge and the filter bar can nudge admins toward indexing fields it renders a filter widget for.
- This is v1's full answer to "fast filtering on any field": correctness works everywhere via the baseline GIN index; guaranteed speed at scale is opt-in per hot field, not automatic for all fields. Documented plainly, not hidden.

## API surface

tRPC v11 router `dataModelsRouter`, `packages/data-models/src/server/router.ts`, mounted at `trpc.dataModels.*`:

```ts
// Schema management — gated by data-models.manage-schema / read-schema
models.list / getById / getByKey / create / update / delete / restore
fields.list / create / update / reorder / archive / unarchive / requestIndex
integrations.listAvailable   // reads the in-memory registry, no DB
integrations.get / save      // validates slotMappings against field types

// Records — gated by data-models.record.{read,write,delete}
records.list      // filter / sort / group params, scoped by dataModelId + org ;
                  // cursor-paginated per the house convention (@monark/common/pagination) :
                  // input { ...query, limit?, cursor? } → { items, nextCursor, total }
records.getById
records.create / update
records.delete / restore
```

Registration mirrors the existing `registerPermissions`/`registerFlags` idiom:

```ts
// packages/data-models/src/contracts/integrations.ts
export type IntegrationSlotDef = {
  types: DataFieldType[];
  required: boolean;
  relationTarget?: string;
  description: string;
};
export type ModelIntegrationDef = {
  slots: Record<string, IntegrationSlotDef>;
  description: string;
};

export function registerModelIntegration(module: string, def: ModelIntegrationDef): void;
export function listModelIntegrations(): Array<{ module: string } & ModelIntegrationDef>;
export function getModelIntegrationDef(module: string): ModelIntegrationDef | undefined;
export function _resetModelIntegrationRegistryForTesting(): void;
```

Calendar's registration (`packages/calendar/src/server/model-integration.ts`):

```ts
registerModelIntegration("calendar", {
  description: "Materializes a Data Record onto a Calendar as a real CalendarEvent.",
  slots: {
    time: {
      types: ["DATE", "DATETIME"],
      required: true,
      description: "Which field is the event's start time.",
    },
    calendarRef: {
      types: ["RELATION"],
      relationTarget: "Calendar",
      required: true,
      description: "Which Calendar this record belongs to.",
    },
  },
});
```

## UI flows

### Admin schema builder — `/admin/data-models`

- Model list: `DataTable` + `FilterBar`, same shell as today's `projects-list.tsx`.
- Per-model tabbed editor (`/admin/data-models/[modelId]`):
  - **Fields** — drag-reorder list (`@dnd-kit`, already used by `DataTable`), add/edit field opens a `Sheet` via `TableDetailLayout`/`useDetailPanelRoute`, type-specific config sub-form driven by `fieldConfigSchemas`.
  - **Title field** — picker over the model's own fields.
  - **Integrations** — one card per registered module (from `integrations.listAvailable`), a `<select>` per slot filtered to fields matching that slot's allowed types. Nothing here hardcodes "Calendar" or any other module name — it's driven entirely by the registry payload, the same way `/admin/feature-flags` renders any module's flags generically.

### Generic record list + detail — `/records/[modelKey]`

- **Build on the existing `components/fields` toolkit — do not rebuild it.** `services/web/src/components/fields` is a descriptor-driven field toolkit already in the tree, built for exactly this migration : a `FieldDef` union (the 12 types mapped above), a `FieldInput` registry (`registry.tsx` — the `Record<DataFieldType, Component>` this section calls for), read-only `cells.tsx` + `fieldColumn(def)` → `DataColumnDef`, `schemaFor` (→ the shared `valueSchemaFor`, see "Field-type system"), and `AutoForm` (a `react-hook-form` + `zodResolver` schema-driven form). The record UI is a thin layer over this : translate a `DataField[]` into `FieldDef[]`, then reuse `fieldColumn` for the table and `AutoForm` for the detail panel. The remaining gap is a `DataField → FieldDef` adapter and the relation-field's async option loading, not a new form stack.
- Columns (`DataColumnDef[]`) and the detail-panel form are both built by mapping over `DataField[]` — via the `FieldDef` adapter — against the toolkit's registry : `fieldColumn` for read-only cells, `FieldInput` for editable inputs.
- `primaryColumn` is always the model's title field, falling back to "Untitled" if none is set yet — satisfies `DataTable`'s mandatory pinned-primary-column rule.
- List = `FilterBar` (data-driven filter controls, prioritizing indexed fields) + `DataTable` (`storageKey: data-models.${modelKey}.table`, cursor pagination via `usePaginatedList` + `DataTable pagination`) + `TableDetailLayout`.
- Detail/edit panel: `AutoForm` (already `react-hook-form` + `zodResolver`), fed the shared `valueSchemaFor` validation. `PanelHeader` for chrome, `FormActionsFooter` for submit/cancel/delete, `ConfirmDialog` for destructive actions.
- **Already done — was listed as a prerequisite.** `react-hook-form@7.64` + `@hookform/resolvers@5.2` are in `services/web`, `services/web/src/components/ui/form.tsx` exists, and the fields toolkit (including `AutoForm`) is live and consumed by `project-form.tsx` / `industries-list.tsx` / the calendar event popover. There is no "pull in the form primitive" step to do. Note the current Project/Industry forms use the toolkit's _inputs_ but are still hand-rolled (manual state, ad-hoc validation) rather than `AutoForm` ; they are retired by this cutover, not retrofitted.
- Every async surface (`models.list`, `fields.list`, `records.list`, the detail panel's `getById`) ships a layout-accurate `Skeleton`, per the existing `industries-list.tsx` convention.

## Dependencies

- `rbac`: `data-models.manage-schema` / `read-schema` / `record.{read,write,delete}` permissions, enforced via `requirePermission` — never a role-string comparison.
- `organizations`: `DataModel.organizationId` scoping.
- `feature-flags`: gates the Project/Industry cutover itself (`projects.use-data-models-engine`).
- `common` (event bus) + `webhooks`: every record write is a domain event, auto-subscribable by operators with zero extra webhook code.
- `calendar`: consumes the integration registry to materialize `CalendarEvent` rows. `@monark/calendar` is already registered in `modules.manifest.ts` as `extended` — no promotion needed; extended modules may depend on core modules (including the new `@monark/data-models`), the restriction is only extended→extended.
- `@monark/data-models` itself is **core tier**, not extended: extended modules can't depend on other extended modules, and this engine must be depended on by Calendar and (temporarily) by the `projects` shim — so it can't be extended tier itself.

## Integration points

### Events emitted

```ts
"data-models.record-created"; // { dataModelId, dataModelKey, recordId, organizationId, actorId }
"data-models.record-updated"; // + changed: string[] (DataField.key[] + "title"/"slug")
"data-models.record-deleted"; // + hard: boolean
"data-models.schema-changed"; // { dataModelId, kind: "model" | "field" | "integration", actorId }
```

Registered via `registerDataModelsEventTypes()` for the webhooks subscription picker.

### Events consumed

- Calendar's `registerCalendarDataModelSubscriber()` listens for `data-models.record-{created,updated,deleted}`, checks for an enabled `calendar` integration mapping on the record's model, and upserts/deletes a `CalendarEvent` keyed on `(sourceModule: "data-models", sourceRecordId: record.id)`. Calendar's own read paths (day view, reminders) are untouched — they just see more `CalendarEvent` rows.

### Legacy compatibility (Project/Industry migration window)

- `@monark/projects` keeps its exact `projects.*`/`industries.*` tRPC shapes and `project.*`/`industry.*` domain events, but delegates internally to `@monark/data-models`, behind `registerFlags("projects", { "use-data-models-engine": { defaultOn: false } })` — flip back instantly if a discrepancy surfaces.

## Edge cases & risks

- **Free-typed `keywords` on Project.** Today's `Project.keywords` is unconstrained `String[]`; the new engine's `MULTI_SELECT` implies a fixed option list. Resolved by adding `allowCustomValues: boolean` to `MULTI_SELECT`'s config (Notion-style "type to add a new option") rather than forcing a fixed list or adding a separate TAGS type.
- **`ProjectContributor` join table.** Has no fields of its own beyond the join — folds directly into a `RELATION` field (`contributors`, cardinality MANY, targeting `OrganizationMembership`) on the migrated `project` Data Model rather than getting its own model.
- **Industry's platform-wide scope.** Becomes exactly one `DataModel(key: "industry", organizationId: null)`; its schema-editing RBAC continues to route through the platform-tier `requirePermission` call with no `orgId` (SYSADMIN-only in practice), matching today's `industries.write` behavior.
- **Relation fields at scale.** No real FK/referential integrity — ids live inside JSONB. Acceptable at hundreds-to-low-thousands of rows per model; a later phase could special-case "materialize hot relation columns as real FK columns" the same way the Calendar integration already materializes into `CalendarEvent`, but that's out of scope here.
- **Rollback window.** Old `Project`/`Industry`/`ProjectContributor` tables are left physically untouched (the shim stops writing to them once the flag flips) for **3–5 days** in production as a point-in-time snapshot before a dedicated follow-up PR drops them.
- **No external webhook consumers today.** `project.*`/`industry.*` events retire (not permanently bridged) once the compatibility shim package is deleted at the end of the migration window.

## Success metrics

- A sysadmin can create a new Data Model and start creating/filtering/sorting records without an engineering change or deploy.
- Filter/sort on a field an admin has opted into indexing returns in line with today's `Project`/`Industry` list-view performance at equivalent row counts.
- Zero data loss / discrepancy between legacy `Project`/`Industry` tables and their migrated `DataRecord` rows during the verification window.
- Calendar correctly reflects created/updated/deleted Data Records for any model with an enabled Calendar integration, with no changes required to Calendar's own read paths.

## Implementation notes

- Scaffold via `pnpm gen:module data-models --tier core`; layout: `contracts/{field-types,integrations,events,model}.ts`, `server/{data-models,fields,records,integrations,indexing,relations,permissions,event-types,router}.ts`, `client/{use-record-form-schema,field-inputs/}`.
- Migration backfill (`tools/migrate-projects-to-data-models.ts`) is a one-shot, transactional, idempotent TypeScript script (matching the `tools/single-org-user-backfill.ts` convention), not a Prisma migration — it checks for existing rows by key before creating, mirroring the repo's existing `ON CONFLICT DO NOTHING` idempotent-seed pattern.
- Prove the engine standalone first: ship it and validate end-to-end against a throwaway seeded demo model (`tools/seed-data-models-demo.ts`) _before_ writing the Project/Industry backfill, so "does the engine work" bugs don't get conflated with "did the migration transcribe correctly" bugs in the same review.
- Rollout order (PR 0, adding `@monark/calendar` to the manifest, is already done — it's registered as `extended`): (1) scaffold `@monark/data-models` + schema + port `components/fields/schema.ts`'s logic into `contracts/field-types.ts` as the messageless `valueSchemaFor` (client layer re-wraps it with i18n), (2) model/field CRUD + schema RBAC, (3) record CRUD + events, (4) admin schema-builder UI, (5) generic record UI proven on the demo model — a `DataField → FieldDef` adapter over the existing `components/fields` toolkit (`fieldColumn` + `AutoForm`), not a new form stack, reusing the `usePaginatedList` + `DataTable pagination` convention already shipped for Project/Industry, (6) per-field indexing, (7) integration registry + admin tab, (8) Calendar slot registration + materialization subscriber, (9) Project/Industry backfill script, (10) `projects` shim rewrite behind the flag, (11) flip the flag + verify + rewrite `services/web`'s Project/Industry screens, (12) drop old tables/enum + delete `@monark/projects`. (The former "pull in `ui/form.tsx`" step is dropped — `react-hook-form` + zod + `ui/form.tsx` + the fields toolkit are already in `services/web`.)
- Every PR satisfies `app/CLAUDE.md`'s Definition-of-done: RBAC registered, events registered, tier boundaries respected (no `schema.prisma` edits from extended modules, no extended→extended deps), `pnpm gen` fresh, strict TS holds, skeleton loading states, i18n en+fr, README + CHANGELOG updated, `register*` helpers wired into `services/api/src/server.ts`.

## Out of scope / future iterations

- Formula / rollup / computed fields.
- Per-row (record-level) authorization (`DataModelRoleAccess`, mirroring `CalendarRoleAccess`).
- Materialized real-FK relation columns for high-scale relation fields.
- Moving a Data Model between platform-wide and org-scoped after creation.
- A permanent legacy-event bridge for `project.*`/`industry.*` beyond the migration window.
