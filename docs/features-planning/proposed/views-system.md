# Views ; a real View entity, with board and calendar view types

> Phase B (and the materialization half of Phase C) of the integration program. The tree and the
> section live in [workspace-unification.md](workspace-unification.md) ; read it first. Access is
> [access-control-console.md](access-control-console.md).
>
> **Source**: this spec transcribes the approved program plan of 2026-09-07, re-verified against the
> code on 2026-09-10. Where the plan locked a decision, this doc records it rather than re-opening
> it.

## Context

There are **five unrelated things called "view"** today, and no view-type concept anywhere (grepping
`viewType|ViewType|viewConfig` finds four hits, all a local `CalendarViewType` union inside
`calendar-shell.tsx`):

| Thing                           | Shape                                                                              | Scope             |
| ------------------------------- | ---------------------------------------------------------------------------------- | ----------------- |
| `DataRecordView`                | `{ name, query Json, shared, createdBy }` ; a filter tree, nothing more            | per model         |
| `KanbanView`                    | byte-identical, keyed by `boardId`                                                 | per board         |
| `DataTableLayout`               | `{ columnOrder, columnVisibility, columnSizing, sorting }` ; **localStorage only** | per table/browser |
| `CalendarViewSettings`          | user-metadata sidecar                                                              | per user, global  |
| `?view=` / `?board=` / `?date=` | ephemeral                                                                          | URL               |

And `@monark/query` models **filtering only**: no sort spec, no group-by, no projection.

Meanwhile a board and a calendar are containers with their own storage, even though what they show
is "records, grouped" and "records, placed in time". Calendar already half-admits this: its
`registerCalendarDataModelSubscriber` materializes a `CalendarEvent` from a `DataRecord` through
`DataModelIntegration` slot mappings, keyed by `sourceModule` / `sourceRecordId`.

A view should become "a saved way of looking at a database": type, filter, sort, and per-type
configuration, shared with everyone who can read the model.

## Goals

- **One View entity** with a `type` (`TABLE` / `BOARD` / `CALENDAR`) and per-type `config`.
- **A sort input on `records.list`**, which is the one real engine gap.
- **Saved versus session state**: changing filter or view type mid-session is local, invisible to
  others, and clears on navigation until saved.
- **A permission for editing shared views**, since a shared view is configuration, not a personal
  filter.
- **Board and calendar views over a database**, via materialization and write-back.

## Locked decisions (do not re-litigate)

- **Materialize and write back.** `KanbanCard` and `CalendarEvent` typed tables **stay
  authoritative**. A database-backed view materializes `DataRecord`s into them through a subscriber,
  and drag or edit writes back to the mapped fields. **No storage migration.** Reconfirmed
  2026-09-10 against the alternative (migrate records into Data Models and drop the typed tables) ;
  the locked call stands. Native boards and calendars are unaffected at every step.
- **Extend `DataRecordView` in place ; do not build a polymorphic view table** spanning kanban
  boards. Kanban is extended and `DataRecordView` is core, so a core table cannot FK to
  `KanbanBoard` ; and in the target architecture a board _is_ a view over a database, so the view
  belongs to the `DataModel`. `KanbanView` stays untouched for native boards and is deprecated over
  time rather than migrated.
- **No `DataRecord.position`.** Manual row ordering is deliberately not added: materialization keeps
  drag ordering in `KanbanCard.position`, where it already works, so the engine does not need it.
  Revisit only if native ordering of a _table_ view is later requested.

## Non-goals

- **Gallery / timeline / gantt types.** The union makes them additive ; not in this program.
- **Cross-database views.** One source model per view. Joining is what relations plus traversal are
  for, and multi-level traversal is
  [already deferred](../../technical-documentation/data-model-queries/deferred.md).
- **Per-view access control.** A view narrows what you already may read ; it never widens.

## User stories

- **As an analyst**, I filter a database, reorder and hide columns, save it as a view, and my
  colleague opens the same link and sees the same thing.
- **As anyone**, I tweak a shared view for a one-off question ; a dirty bar offers Save, Save as new
  and Reset, and navigating away loses only my tweak.
- **As a project lead**, I switch a database to **Board**, group by **Status**, and drag a card
  between columns ; the record's Status field changes.
- **As a project lead whose model has no SELECT field**, switching to Board offers to create one
  rather than disabling the menu item.
- **As a scheduler**, I drag a materialized event and the record's mapped date fields move.

## Data model

```prisma
enum DataViewType { TABLE  BOARD  CALENDAR }

model DataRecordView {
  // existing : id, dataModelId, organizationId, name, query Json, shared, createdBy, timestamps
  type     DataViewType @default(TABLE)
  /// Per-type configuration, validated by a discriminated zod union on write.
  config   Json         @default("{}")
  icon     String?
  /// Views render as ordered tabs on the database.
  position Int          @default(0)
}
```

`config`, a discriminated union in `packages/data-models/src/contracts/views.ts`:

- **TABLE** ; `{ columns: { key, width?, hidden? }[], sort: { field, dir }[] }`. This is where the
  currently-localStorage-only `DataTableLayout` graduates to server state.
- **BOARD** ; `{ groupByFieldKey (a SELECT field), cardFieldKeys[], showEmptyGroups }`.
- **CALENDAR** ; `{ startFieldKey, endFieldKey?, allDayFieldKey? }`.

Existing rows migrate cleanly: `type = TABLE`, `config = {}` preserves today's behavior exactly, and
an integration test should assert precisely that.

## Sorting is the one real engine gap

`records.list` has **no sort input** ; ordering is hardcoded `[{ updatedAt: "desc" }, { id: "desc" }]`
at `data.ts:147` (structured path) and `:739` (raw path). A TABLE view's saved sort needs it.

Add `sort?: { field, dir }[]`, compiled against the same expression indexes the filter compiler
targets. The constraint is that **keyset pagination must stay valid**: the cursor is currently the
last row's id resolved through a subquery on `(updatedAt, id)`, and with an arbitrary sort field it
becomes a compound `(sortValue, id)` keyset. This is the most delicate change in the phase and
deserves **its own PR**, with the existing pagination contract in
`packages/data-models/tests/integration/query-language.test.ts` extended to cover sorted paging,
ties, nulls, descending, and a sort field with and without an expression index.

## Saved versus session state

- **Saved baseline** is the `DataRecordView` row (server).
- **Session overlay** is React state in the section, seeded from the view and reset when the active
  view or model changes. **Not `localStorage`**, because "clears on navigation" is the stated
  behavior and `localStorage` would survive it.
- **`DataTableLayout`'s `localStorage` keeps a narrower job**: per-browser column **widths**, which
  are a display preference. Column _order_ and _visibility_ move into the saved view. Say this in
  the UI so it is not surprising.
- A dirty view uses the existing `DirtyFormBar` pattern: "Unsaved view changes ; Save / Save as new
  / Reset".

## Who may save a shared view

Today the write gate is `requireOwnedView`: **ownership only, with no permission**, so an admin
cannot edit someone else's shared view. Once a view is shared configuration rather than a personal
filter, that is wrong.

Add **`data-models.manage-views`**: the owner may always edit their own ; a holder of
`manage-views` may edit any **shared** view on a model they can read. Personal (unshared) views stay
owner-only regardless.

## Switching a database to a board or calendar

A view type is only meaningful with a compatible field mapping: BOARD needs a SELECT field to group
by, CALENDAR needs a DATE or DATETIME.

When the model has none, **do not disable the menu item with a tooltip.** Open a short setup dialog
offering to create the missing field (a SELECT named "Status" with `To do / In progress / Done`, or
a DATE named "Date") and then create the view. A dead end becomes one click.

## Materialization and write-back

The precedent exists and is shipped for Calendar ; Kanban copies it.

### Kanban

This is Part B of [`phase-3/data-models-visualizations.md`](../phase-3/data-models-visualizations.md),
still valid and never built.

- `registerKanbanModelIntegration()` calling `registerModelIntegration("kanban", { slots })`,
  mirroring calendar's, with slots `status` (SELECT, required), `dueAt`, `priority`, `assignees`,
  `estimate`.
- Schema: `KanbanCard.sourceModule` / `sourceRecordId` with `@@unique([sourceModule, sourceRecordId])`
  (mirroring `CalendarEvent`), and `KanbanBoard.dataModelId String?` where null means a native board,
  untouched.
- **Columns derive from the `status` field's options** (label, color, order), and column CRUD is
  disabled on a database-backed board because the schema owns the columns. `KanbanColumn.wipLimit`
  has no home in a SELECT option (`{ value, label, color }`), so accept that database-backed boards
  have **no WIP limits in v1** rather than widening the option shape for one consumer.
- A subscriber on `data-models.record-{created,updated,deleted}` upserts or soft-deletes the card
  keyed on `("data-models", recordId)`, idempotent so replays are safe.
- **Write-back**: a cross-column drag calls `records.update` on the mapped `status` field ;
  mapped-field edits write back likewise ; `position` is kanban-owned and **never** writes back.
  Loop guard by diff-check before writing, so record-update to card-update converges in one pass.

### Calendar

The bridge exists but is one-way and lossy: materialized events are forced `PUNCTUAL`
(`startAt === endAt`), so a mapped record can only ever be a point, never a range.

- A **paired range slot** (`start` plus optional `end`) so a record with two date fields materializes
  as a real `STANDARD` event and the day/week overlap fetch works.
- **Write-back**: dragging or resizing an event whose `sourceModule` is `data-models` updates the
  record's mapped date fields rather than the event directly.

Reminders, recurrence and ICS stay calendar-owned. They are calendar mechanics, not record data, and
giving every model a reminders column to satisfy them is the bloat this program avoids ; keeping
`CalendarEvent` authoritative means they need no re-keying at all.

## Dependencies

- Shipped: MonarkQL and its single compiler, `QueryChipBar`, `useDataTableLayout`, dnd-kit,
  `DirtyFormBar`, `registerModelIntegration`, the calendar materialization subscriber.
- Phase C (the tree) consumes views but does not block them ; the sort work blocks the TABLE view.

## Edge cases and risks

- **A view over a scoped model.** The view's query is AND-ed with the caller's compiled
  [record scope](../../technical-documentation/record-scopes.md), so two people open the same board
  and see different cards. Correct, and it needs saying in the user guide, because "the board looks
  different for me" reads as a bug otherwise.
- **Materialization loops.** record-update fires card-update fires record-update. The diff-check
  before write is what makes it converge ; test it explicitly rather than trusting it.
- **A record that leaves the view's filter.** Its materialized card must be removed, which means the
  subscriber evaluates the view predicate, not just the model id. A card that lingers after its
  record stops matching is the likeliest bug in the whole phase.
- **Board column count.** Grouping by a SELECT with 200 options renders 200 columns. Cap the
  rendered set and put the tail behind "show more" ; do not silently truncate.
- **`showEmptyGroups` and a null group-by value.** A record whose SELECT is unset renders in an
  Uncategorized column that is **never a drop target** ; dropping into it would mean "unset this
  field", which is a data edit dressed up as a layout gesture.
- **Sorted keyset paging** is the one place a subtle bug is expensive. See the sorting section.

## Success metrics

- One entity answers "how am I looking at this database", with type, filter, sort and config.
- Table layout survives a device change (the concrete user-visible win of server-side config).
- A database-backed board round-trips: record edit reconciles the card, cross-column drag flips the
  record's field, within-column drag changes only `position` and leaves the record untouched.
- Native boards and calendars are provably unaffected at every step.

## Out of scope

- Gallery, timeline, gantt types.
- Manual ordering of a table view (`DataRecord.position`), deliberately deferred.
- Formula-driven grouping ; needs a formula result type pinned to a finite option set first.
- Per-view subscriptions ("notify me when anything enters this view"), which means evaluating every
  view's predicate on every record write.
