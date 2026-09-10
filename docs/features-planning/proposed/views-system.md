# Views ; one saved-view system, with Kanban and Calendar as view types

> Part of the workspace unification program. The tree and the section live in
> [workspace-unification.md](workspace-unification.md) ; read it first.

## Context

Three saved-query features shipped independently and mean nearly the same thing:

- **`DataRecordView`** (core, `base.prisma`): a named MonarkQL tree per Data Model, personal by
  default, `shared = true` to publish. Loaded by the web `ViewsMenu`, which prints the tree back to
  query text. Documented in
  [saved-views.md](../../technical-documentation/data-model-queries/saved-views.md).
- **`KanbanView`** (extended): the same idea per board, a straight copy of the pattern.
- **Table layout** (`useDataTableLayout`): column order, visibility, widths and multi-column sort,
  persisted in `localStorage` per browser. Not shareable, not part of a view, and lost on another
  device.

Meanwhile a _board_ and a _calendar_ are containers with their own storage
(`KanbanBoard`/`KanbanColumn`/`KanbanCard`, `Calendar`/`CalendarEvent`), even though what they
show is "records, grouped" and "records, placed in time". Calendar already half-admits this: its
`registerCalendarDataModelSubscriber` materializes a `CalendarEvent` from a `DataRecord` through
`DataModelIntegration` slot mappings, keyed by `sourceModule` / `sourceRecordId`, so a data record
can already appear on a calendar. That bridge is the proof of the idea and also the reason it needs
generalizing: it is one-way, one-module, and duplicates every event row.

A **view** should be the single answer: _a named, filtered, shaped presentation of one database_,
saved and shareable, or edited locally and thrown away.

## Goals

- **One `View` entity** for every presentation of a database: `TABLE`, `BOARD`, `CALENDAR`.
- **The query is MonarkQL**, the same text the record list and
  [record scopes](../../technical-documentation/record-scopes.md) already use, authored with the
  same `QueryChipBar`. One language, learned once.
- **Presentation is part of the view**, not the browser: grouping, column order, visibility,
  widths, sort, and the per-kind field mapping all live server-side on the view.
- **Local edits without saving.** Changing a filter or a column on someone's shared view does not
  touch it ; the change is yours until you Save, Save as new, or Reset. Notion's model.
- **Kanban and Calendar become view kinds** over real Data Models, with their existing data
  migrated, not re-entered.
- **Calendar keeps a sidecar** for what genuinely does not belong in a database (reminders,
  recurrence), rather than bloating every model with calendar columns.

## Non-goals

- **Gallery / timeline / gantt kinds.** The registry makes them additive ; not in this program.
- **Cross-database views.** A view has exactly one source model. Joining is what relations plus
  traversal are for, and multi-level traversal is
  [already deferred](../../technical-documentation/data-model-queries/deferred.md).
- **Per-view access control.** A view narrows what _you already may read_ ; it never widens.
  Visibility comes from the model, the row ACL and record scopes, unchanged.
- **Write-back semantics beyond the obvious.** Dragging a card between board columns writes the
  group-by field. Dragging an event writes the date fields. Nothing more implicit than that.

## User stories

- **As an analyst**, I filter a database in the query bar, reorder and hide columns, then click
  **Save as view**, name it, and it appears in the tree under the database.
- **As a teammate**, I open that view's link and see exactly what they saw.
- **As anyone**, I tweak a shared view's filter to answer a one-off question ; a "Modified" chip
  appears with **Save**, **Save as new** and **Reset**, and closing the tab loses nothing but my
  tweak.
- **As a project lead**, I switch a database to **Board**, group by **Status**, and drag a record
  from _In progress_ to _Done_ ; the record's Status field is now _Done_.
- **As a scheduler**, I switch to **Calendar**, map _Start date_ and _Due date_, and drag an item
  to next Tuesday ; the record's dates move.
- **As a user with no database at all**, I still open Calendar and add a meeting, because the org
  ships with an Events database provisioned for exactly that.

## Data model

The existing `DataRecordView` grows into the View entity, in place, under the data-models banner
in `base.prisma`:

```prisma
enum DataViewKind { TABLE  BOARD  CALENDAR }

model DataRecordView {
  id             String       @id @default(cuid())
  dataModelId    String
  organizationId String
  name           String
  kind           DataViewKind @default(TABLE)   // NEW
  query          Json                            // MonarkQL FilterNode tree, as today
  // Presentation. Per-kind shape, validated by the matching zod schema
  // (contracts/view-config.ts) exactly as DataField.config is.
  config         Json         @default("{}")     // NEW
  shared         Boolean      @default(false)
  createdBy      String
  …
}
```

`config` by kind, each with its own zod schema:

| Kind       | `config`                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `TABLE`    | `columns[] { fieldKey, hidden, width }`, `sort[] { fieldKey, direction }`                                                                    |
| `BOARD`    | `groupByFieldKey` (a `SELECT` field), `columnOrder[]` (option values), `hiddenOptions[]`, `wipLimits{}`, `cardFields[]`, `swimlaneFieldKey?` |
| `CALENDAR` | `startFieldKey`, `endFieldKey?`, `allDayFieldKey?`, `defaultRange` (`month`/`week`/`day`), `colorFieldKey?`                                  |

**Manual ordering inside a board column** is the one thing a query cannot express, and it is
genuinely per-view (the same record sits differently in two people's boards). It gets a sidecar:

```prisma
// Manual card order within a BOARD view. Absent row = fall to the view's sort.
model DataRecordViewOrder {
  viewId   String
  recordId String
  // Group bucket the position is within (the group-by option value), so a
  // record moving between columns does not have to renumber the other one.
  bucket   String
  position Int      // steps of 10, house convention

  @@id([viewId, recordId])
  @@index([viewId, bucket, position])
}
```

**Why not put ordering on the record.** A `position` column on `DataRecord` would make ordering
global to the model, so two boards over the same database would fight over it, and a filtered view
would show gaps it cannot close. Per-view is the only placement that composes.

`KanbanView` is absorbed and dropped (its rows migrate to `DataRecordView` with `kind = BOARD`).

## Local (unsaved) view state

The state a user is looking at is `saved view + local overrides`. Overrides live in the **URL**
(query, kind, group-by) so a link reproduces what you see, with the bulkier parts (column widths)
in `sessionStorage` keyed by view id. Never `localStorage`: a stale override that outlives the tab
and silently reshapes a shared view next week is worse than losing it.

The affordance is a chip in the toolbar next to the view name:

- **unmodified**: the view's name.
- **modified**: name + a "Modified" badge, with **Save** (owner only ; disabled with a tooltip when
  you do not own a shared view), **Save as new** (always) and **Reset**.
- **no view selected**: the database's default table state, with **Save as view**.

Leaving a modified view prompts once, the way `DirtyFormBar` does, and only when the change is
saveable by that user.

## The kinds

### Table

Mostly a relocation: `useDataTableLayout` keeps owning the _live_ layout, but a saved view
initializes it and **Save** writes it to `config` instead of only `localStorage`. Per-browser
persistence remains the fallback for a database opened with no view. This is the phase that proves
the config plumbing before either harder kind lands.

### Board

Grouping is over a `SELECT` field: its options are the columns, in `columnOrder`. Everything the
current Kanban UI does maps onto that ; WIP limits, colors and the collapse state come from the
option config plus `config`, and the drag machinery (dnd-kit) is reused as is. Dragging across
columns is a normal `records.update` on one field, so it goes through the same permission gate,
emits the same `data-models.record-updated` event, and is scoped by record scopes for free.

A record whose group-by value is null renders in an **Uncategorized** column that is never a drop
target ; dropping _out_ of it sets the field, dropping _into_ it would mean "unset this field",
which is a data edit dressed up as a layout gesture.

### Calendar

Placement is over `DATE` / `DATETIME` fields named by `startFieldKey` / `endFieldKey`. This
generalizes `DataModelIntegration`'s calendar slots: the mapping stops being one per model per
module and becomes one per view, so the same database can feed two calendars keyed on different
dates ("created" and "due"). Dragging or resizing writes those fields.

**What Calendar keeps for itself.** Reminders and recurrence are calendar mechanics, not record
data, and giving every model a `reminders` column to satisfy them is exactly the bloat this program
avoids. They stay in `@monark/calendar`'s own fragment, re-keyed from a `CalendarEvent` to a
`(viewId, recordId)` pair:

```prisma
model CalendarRecordReminder {
  id             String   @id @default(cuid())
  organizationId String
  viewId         String   // the CALENDAR view this reminder was set on
  recordId       String   // soft reference, like CalendarEvent.sourceRecordId today
  minutesBefore  Int
  scheduledFor   DateTime
  notifiedAt     DateTime?
  @@index([scheduledFor, notifiedAt])
}
```

The existing reminder sweep keeps working against it with a changed join. Recurrence, if it is
built, belongs in the same sidecar for the same reason.

**The out-of-the-box calendar.** Removing `Calendar`/`CalendarEvent` must not mean "you need to
build a database before you can note a meeting". The migration provisions a system **Events**
database per org (title, description `DOCUMENT`, start, end, all-day, location, participants) and a
`CALENDAR` view over it, and that is what `/calendar` redirects to. Provisioning follows the
existing convention where a model auto-creates its protected `title` field.

## Server surface

`dataModels.views.*` grows rather than moves:

| Procedure                                     | Change                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| `views.list` / `create` / `update` / `delete` | gain `kind` + `config` ; unchanged gating (`record-read` to list, owner to edit)   |
| `views.reorderRecords`                        | **new** ; writes `DataRecordViewOrder` for a drag within or across board buckets   |
| `records.list`                                | accepts a `viewId` so the server resolves query + sort + manual order in one place |

`config` is validated against the kind's zod schema on write, and a config naming a field the model
does not have is rejected at save time ; the same rule record scopes adopted, for the same reason
(a broken presentation should fail when it is authored, not when it is opened).

Unlike a scope, a broken _saved_ config **degrades open**: a view whose group-by field was archived
renders as a table with a banner, because a view is a lens, not an authorization control. That
asymmetry is deliberate and worth stating in the module README.

## Migration

Both migrations are one-way data moves and get a rehearsal on staging before production.

**Kanban → Data Models.** Per live `KanbanBoard`:

1. Create a `DataModel` named after the board, with fields: `title` (TEXT, the protected default),
   `description` (`DOCUMENT`, from the card's block array), `status` (`SELECT`, options seeded from
   the board's columns in `position` order), `assignees` / `reviewers` (RELATION MANY to users),
   `dueAt` (`DATETIME`), `priority` (`SELECT`), `estimate` (`NUMBER`).
2. One `DataRecord` per `KanbanCard`, values mapped straight across ; `descriptionText` is
   recomputed by the normal write path rather than copied.
3. One `DataRecordView` with `kind = BOARD`, `groupByFieldKey = "status"`, `columnOrder` from the
   columns, WIP limits carried into `config`.
4. `DataRecordViewOrder` rows from each card's `position`, bucketed by its column.
5. `KanbanBoardRoleAccess` rows become `DataRecordRoleAccess` on every migrated record, which is
   the literal-preservation choice ; the console track can later replace them with one record scope
   per role, which is what they actually mean.

**Calendar → Data Models.** Per live `Calendar`, the same shape into an Events-style model, with
`CalendarEvent.sourceRecordId`-materialized events **skipped** (they are already a projection of a
record ; migrating them would duplicate their source). `CalendarEventReminder` rows become
`CalendarRecordReminder` against the new view.

The old tables are left in place, unread, for one release. A rollback in that window is a flag
flip, not a restore.

## Dependencies

- [workspace-unification.md](workspace-unification.md) for the `view` node kind and the tree
  placement ; views are usable without it (they would live in the database's own view menu) but the
  program only pays off together.
- MonarkQL and its single compiler ; the `QueryChipBar` ; `useDataTableLayout` ; dnd-kit and
  `DragHandle` ; the block editor for `DOCUMENT` card bodies. All shipped.

## Edge cases and risks

- **A view over a scoped model.** The view's query is AND-ed with the caller's compiled scope, so
  two people open the same board and see different cards. That is correct and needs saying in the
  user guide, because "the board looks different for me" reads as a bug otherwise.
- **Board column count.** Grouping by a `SELECT` with 200 options renders 200 columns. Cap the
  rendered set, sort by option order, and put the tail behind a "show more" ; do not silently
  truncate.
- **Manual order versus sort.** A board with an explicit sort ignores `DataRecordViewOrder` ; the
  UI must say so rather than accepting a drag that does nothing. Dragging while sorted offers to
  clear the sort.
- **Record count per column.** The record list is cursor-paginated ; a board is not. Paginate per
  bucket with a "load more" per column, and count with one grouped query rather than N.
- **Two boards, one field.** Dragging in one board changes the field for the other, which is the
  point, but a stale open board must not silently disagree ; the existing record-watch fan-out
  already carries the update, so the board subscribes to it.
- **Migration idempotency.** Both migrations must be re-runnable ; key created models to their
  source id in a scratch column (or a `DataModelIntegration` row) so a second run is a no-op.

## Success metrics

- `KanbanView` deleted ; `DataRecordView` is the only saved-view table.
- A board and a calendar are configurations, not schemas: adding a fourth kind is a zod schema, a
  renderer and a registry entry.
- Table layout survives a device change (the concrete user-visible win of moving it server-side).
- Zero records lost or reassigned in migration, asserted by pre/post count and checksum tests.

## Out of scope

- **Gallery, timeline, gantt** kinds.
- **View-level default sharing policy** ("new views in this database are shared by default").
- **Formula-driven grouping** (group by a `FORMULA` field) ; needs the formula result type pinned
  to a finite option set first.
- **Subscriptions per view** ("notify me when anything enters this view"), which is a real feature
  and a real cost, since it means evaluating every view's predicate on every record write.
