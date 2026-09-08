# Kanban module

`@monark/kanban` is an **extended** module that adds a Kanban board view (a
sibling to the calendar). This is the internals reference ; the package
[`README`](../../../packages/kanban/README.md) is the API doc.

## In this section

- **[Shape](shape.md)**
- **[Cross-cutting wiring (the "Big 4/5")](cross-cutting-wiring-the-big-45.md)**
- **[Web view](web-view.md)**
- **[Testing](testing.md)**

## Ordering

Columns and cards each carry an integer `position` in **gaps of 10** (the house
pattern from `data-models`' `reorderDataFields`). A reorder sends the full
ordered id list and rewrites positions in a transaction. `moveCard(boardId,
toColumnId, orderedIdsInTarget)` pins each target card's `columnId` and rewrites
its `position` in one transaction ; the source column keeps its (harmless) gaps.


## Filtering (MonarkQL)

Behind the `kanban.query` flag, the board toolbar shows the shared `QueryBar`
(`services/web/src/components/query/query-bar.tsx`, over the generic
[`@monark/query`](../../../packages/query) language). The tree compiles to a typed
`Prisma.KanbanCardWhereInput` in [`server/query-compiler.ts`](../../../packages/kanban/src/server/query-compiler.ts)
(`compileKanbanFilter`, via `walkFilter`) and loads through the `cards.list`
procedure ; `@variables` (`@me`, `@today`) resolve server-side. Queryable fields

- their kinds live in [`contracts/query-fields.ts`](../../../packages/kanban/src/contracts/query-fields.ts)
  (`priority` is an **orderedSelect** : `priority:>=HIGH` expands to a value set).
  The web builds the field list (labels + per-board options) client-side from the
  board's columns + org members. Saved views + a list view are the planned
  follow-ups.


## Extending

- A new card field: add it to `KanbanCard` (schema + migration), the `cards`
  input/patch in `server/index.ts`, and the card editor.
- Data-Model integration (materialize records into cards): follow the calendar's
  `registerModelIntegration` + subscriber pattern (deferred).
