# Data Models × Kanban / Calendar — visualize any model, keep typed storage

## Context

We shipped **Calendar** and **Kanban** as `extended` modules. Both own dedicated, indexed Prisma tables in the core `schema.prisma` (Calendar: `Calendar` / `CalendarRoleAccess` / `CalendarEvent` / `CalendarEventReminder` ; Kanban: `KanbanBoard` / `KanbanBoardRoleAccess` / `KanbanColumn` / `KanbanCard` + a `KanbanCardPriority` enum). That technically violates the working agreement ("extended modules MUST NOT modify `schema.prisma`") — a rule that is **documentation-only and unenforced** (`check:tiers` only bans extended→extended imports ; nothing inspects the schema).

That prompted a question : since these modules are "just ways to visualize data," could they be rebuilt as thin **view-only** modules that persist their data as records in the polymorphic **Data Models** engine (`@monark/data-models`, `core`) instead of owning tables ?

### Investigation verdict : do NOT relocate their storage into the engine

The Data Models engine is an **EAV-lite store** (every record's fields live in one JSONB `data` column). It is deliberately generic, and that generality is exactly where these two features break :

| What the feature needs                                                                                                         | What the engine offers                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Calendar day/week fetch** = datetime **range + overlap** (`startAt < end AND endAt > start`), backed by `@@index([startAt])` | Filters are **equality / substring only** ; no `gt/gte/lt/lte`, no range. Dates are ISO **strings** in JSON. Not expressible server-side.   |
| **Kanban ordering** = dense integer `position` per column, `orderBy [{ position }]`, multi-row `$transaction` reindex per drag | **No `position`, no manual row order, no sort-by-field** (records only ever sort `updatedAt desc`).                                         |
| **Cross-column move / FK cascade**                                                                                             | Relations are **soft ids in JSON** ; no referential integrity, no cascade.                                                                  |
| **Reminder sweep** (`scheduledFor <= now AND notifiedAt IS NULL`, polled every 60s)                                            | Would scan every reminder-bearing record each minute.                                                                                       |
| **A module owning / seeding its data**                                                                                         | **No API exists.** Data Models are _user-created_ through the admin UI, org-scoped. There is no `registerDataModel` / system-model concept. |

Moving storage to JSON would regress the two query paths that _define_ these features, drop referential integrity, and require substantial new engine work (module-seeded models, record `position` ordering, range + comparison filters, sort-by-field). High cost to regress the hot paths, for consistency we can get more cheaply.

### The decision

The proposal conflates two separate goals ; split them.

1. **Governance** ("extended modules shouldn't touch core schema") — solve at the schema-ownership layer (Part A), keeping the fast typed tables.
2. **"These are just ways to visualize data"** — deliver through the **integration / materialization bridge** that Calendar already has, extended to Kanban (Part B). Any user-defined Data Model can be _viewed_ as a calendar or a board, while each module keeps its typed, ordered, cascading storage.

## Goals

- Keep Calendar and Kanban on their typed tables (no storage rebuild, no regression).
- Let any org-defined **Data Model** be visualized as a **Kanban board** (Calendar already supports this) via a field mapping, with cards materialized into the real `KanbanCard` table so ordering / drag / cascade keep working.
- Moving or editing a model-backed card **writes back** to the source record, so the Data Model stays the source of truth.
- Resolve the schema-ownership contradiction so calendar/kanban owning tables is _sanctioned_, not a silent exception.

## Non-goals

- **Not** moving `CalendarEvent` / `KanbanCard` storage into JSON records.
- **Not** adding `position`, range filters, or sort-by-field to the Data Models engine.
- **Not** building a generic "module registers a system data model" API.
- No new custom-field surface on native cards/events beyond the mapped slots (a later "sidecar custom fields" idea is out of scope).

## Part A — Governance : sanction typed tables for extended modules

The written rule says extended modules use the metadata sidecar or "wait for the per-module-fragment story." That story is **unbuilt Phase-2 roadmap** (`docs/technical-documentation/extensibility-contract.md`, "Per-module schema fragments" : concatenate `prisma/<module>.prisma` files before `prisma generate`). Two ways to make calendar/kanban legitimate ; pick one :

- **Recommended : build per-module schema fragments.** A wrapper around `prisma generate` that merges `packages/<module>/prisma/*.prisma` into the root schema. Lets _any_ extended module own indexed columns + FK relations without editing the core file, and retroactively legitimizes calendar/kanban. Then add a real `check:tiers` rule : an extended module may only define models in _its own_ fragment, never the core `schema.prisma`.
- **Cheap interim : reclassify** `@monark/calendar` and `@monark/kanban` as `core` in `modules.manifest.ts`. Zero code ; it just admits they are core-tier data primitives. Reversible once fragments land.

Either way, **the tables stay as-is**. This track is independent of Part B and can ship on its own timeline ; it is the honest fix for the contradiction, decoupled from the storage-engine question.

## Part B — Visualize a Data Model as a Kanban board

### B.1 The proven precedent (Calendar, already shipped)

Calendar uses the generic Data Models **integration-slot** mechanism, not a bespoke one :

- `registerModelIntegration("calendar", { slots })` (`packages/calendar/src/server/model-integration.ts`) declares a required **`time`** slot (DATE/DATETIME) and a required **`calendarRef`** slot (RELATION → `Calendar`). Slots constrain allowed field types.
- An admin **maps their model's fields** onto those slots ; the mapping persists in `DataModelIntegration` (`upsertModelIntegration`, `packages/data-models/src/server/data.ts`), which validates the mapped field's `config.relationTarget`.
- A subscriber (`registerCalendarDataModelSubscriber`, `packages/calendar/src/server/data-model-subscriber.ts`) listens to `data-models.record-created` / `-updated` / `-deleted` and **materializes** matching records into real `CalendarEvent` rows, keyed on the `@@unique([sourceModule, sourceRecordId])` pair (materialized events are `PUNCTUAL`, `startAt === endAt`).

So the typed table stays authoritative and fast ; records flow into it. Kanban mirrors this exactly.

### B.2 Kanban integration slots

Register via the same registry at api boot (`registerKanbanModelIntegration()` → `registerModelIntegration("kanban", { slots })`) :

| Slot        | Field type(s)                   | Required | Maps to                                                     |
| ----------- | ------------------------------- | -------- | ----------------------------------------------------------- |
| `status`    | SELECT                          | **yes**  | the card's **column** (each select option → a column)       |
| `dueAt`     | DATE / DATETIME                 | no       | `KanbanCard.dueAt`                                          |
| `priority`  | SELECT                          | no       | `KanbanCard.priority` (option value → `KanbanCardPriority`) |
| `assignees` | MULTI_SELECT / RELATION(→users) | no       | `KanbanCard.assigneeIds`                                    |
| `estimate`  | NUMBER                          | no       | `KanbanCard.estimate`                                       |

The card **title** comes from the record's own `title` (every model has a reserved title field), so no slot is needed. `description` maps from the record's rich-text/long-text title-adjacent field only if a slot is added later ; v1 leaves description empty for model-backed cards.

### B.3 Model-backed boards

A **board is bound to a model** (the "view over data" direction), rather than each record pointing at a board :

- Add `KanbanBoard.dataModelId String?` (nullable). `null` = a **native** board (today's behavior, untouched). Non-null = a **model-backed** board whose cards come from that model's live records via the `kanban` `DataModelIntegration` mapping.
- **Columns are derived from the `status` field's options** : one column per option, column name = option label, column color = option color, order = option order. (Admin column CRUD is disabled on model-backed boards ; the schema owns the columns.)
- All live, role-visible records of the model materialize as cards in the column matching their `status` value ; a record whose status is empty/unmapped lands in a "No status" column (or is hidden — config).

### B.4 Materialization + write-back

- **Schema** : add `sourceModule String?` + `sourceRecordId String?` + `@@unique([sourceModule, sourceRecordId])` to `KanbanCard`, mirroring `CalendarEvent`. Native cards leave both `null`.
- **Subscriber** (`registerKanbanDataModelSubscriber`) on `data-models.record-*` : upsert / soft-delete the `KanbanCard` keyed on `("data-models", recordId)`, resolving `columnId` from the mapped `status` option and copying the mapped fields. Idempotent, so replays are safe.
- **Ordering stays kanban-owned.** The materialized card gets a real `position` (appended on first materialization) ; drag-reorder within a column works exactly as native cards (the record has no order field, and doesn't need one).
- **Cross-column drag = write-back.** Moving a model-backed card to another column calls `data-models records.update` to set the record's mapped `status` field ; that emits `data-models.record-updated`, and the subscriber reconciles the card's `columnId`. The move handler optimistically updates locally to avoid a round-trip flash. Editing a mapped field (due date, priority, assignees) on a model-backed card likewise writes back to the record ; kanban-only fields (position) never write back.
- **Guard against loops** : the subscriber diff-checks before writing, and write-back only touches the mapped record field, so record-update → card-update converges in one pass.

### B.5 Access & lifecycle

- Board visibility keeps `KanbanBoardRoleAccess` ; card visibility additionally honors the record's own per-record ACL (`DataRecordRoleAccess`) resolved at materialization (a role-restricted record only materializes for boards/viewers allowed to see it, or is filtered at read).
- Unbinding a board, deleting the model, or a record dropping out of scope removes the materialized cards (soft delete) via the subscriber, same as calendar's `softDeleteCalendarEventBySource`.

## Data model changes

- `KanbanCard` : `sourceModule String?`, `sourceRecordId String?`, `@@unique([sourceModule, sourceRecordId])` (mirror `CalendarEvent`, migration under the kanban banner).
- `KanbanBoard` : `dataModelId String?` (nullable ; native boards unchanged). No FK to `DataModel` is required (soft id, module-decoupled, matching the codebase's "arrays of ids, not FKs" stance) ; validate existence in app code.
- No new mapping table — reuse the existing `DataModelIntegration` (`module = "kanban"`).

## Build order

1. **Governance (Part A)** — decide fragments vs reclassify ; if reclassify, a one-line manifest change unblocks everything cleanly.
2. **Register kanban integration slots** (`registerModelIntegration("kanban", …)`) + wire at api boot next to the calendar registration.
3. **Schema** : `KanbanCard.sourceModule/sourceRecordId` + unique ; `KanbanBoard.dataModelId`. One migration.
4. **Materialization subscriber** : `data-models.record-*` → upsert/delete `KanbanCard` by source key, resolving column from the `status` mapping.
5. **Column derivation** from the `status` field's options (create/sync columns ; lock column CRUD on model-backed boards).
6. **Write-back** : card move → `records.update` of the mapped status ; mapped-field edits → record update. Optimistic local update.
7. **Web** : "New board" gains a **"From a Data Model"** path (pick model + map fields to slots, reusing the data-models integration mapping UI) ; model-backed boards mark mapped fields as record-driven ; native boards untouched.
8. **Cross-cutting** : reuse existing `kanban.*` events (the `card-moved` write-back still emits them) ; keep the `kanban.board` flag ; permissions unchanged (mapping needs `data-models.manage-schema` + `kanban.manage`) ; i18n (en + fr) for the new board-creation path ; module README + user/dev docs ; CHANGELOG.

## Verification

- Bind a board to a model with a `status` SELECT ; every live record appears as a card in the column matching its status.
- Create / edit / delete a record → the card appears / updates / disappears (subscriber reconciliation).
- Drag a card to another column → the record's `status` field flips (write-back) ; drag within a column → `position` reorders and the record is untouched.
- A role-restricted record only shows on boards/for viewers allowed to see it.
- Unbind the board / delete the model → materialized cards are removed ; **native boards are entirely unaffected** at every step.
- Pre-PR gate green : `pnpm gen && pnpm typecheck && pnpm lint && pnpm test && pnpm check:tiers && pnpm check:modules && pnpm check:i18n`.

## Gains / losses recap

- **Gain** : any user data becomes viewable as a board (and already a calendar) without a migration ; the Data Model stays the single source of truth ; extended modules keep fast typed storage ; the schema-ownership contradiction is resolved honestly.
- **Cost** : one migration + a subscriber + a mapping UI per module (small, mirrors calendar) ; the governance track (fragments) is a separate, optional investment.
- **Explicitly avoided** : regressing calendar range queries and kanban ordering, losing referential integrity, and rebuilding relational features on top of JSON.

## Deferred

- Full-JSON storage migration of calendar/kanban (rejected — see verdict).
- Data Models engine `position` / range / sort-by-field (not needed for this path).
- Per-module schema fragments as the general mechanism (Part A "recommended" ; can trail the reclassify interim).
- A `description` slot and richer field mapping for model-backed cards.
- Aligning Calendar's integration UX with the new Kanban board-creation flow.
