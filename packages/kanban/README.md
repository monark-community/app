# @monark/kanban

> **User guide:** [docs/user-guide.md](docs/user-guide.md) — how to use the boards (this README is the developer reference).

A configurable **Kanban board** view (a sibling to `@monark/calendar`). An
organization owns multiple named boards ; each board owns an ordered list of
columns (Backlog / Todo / In Progress / Review / QA / Done by default), and each
column owns an ordered list of cards. Cards drag between columns.

`extended` module. Like the calendar, it owns its own Prisma models in its own
schema fragment [`prisma/kanban.prisma`](prisma/kanban.prisma) under the
`// ── MODULE: kanban ──` banner (assembled into the generated
`schema.prisma` by `pnpm gen:schema`).

## What's here

- **`contracts/`** — pure, transport-safe domain types (`BoardDef`,
  `BoardColumnDef`, `CardItem`, `DEFAULT_COLUMN_NAMES`) and the `KanbanEvents`
  domain-event union (`events.ts`).
- **`server/`** — the tRPC router (`index.ts`, exported as `kanbanRouter`), the
  Prisma data layer (`data.ts`), permission registration (`permissions.ts`), and
  webhook event-type registration (`event-types.ts`).
- **`client/`** — pure React presentation primitives (`BoardArea`,
  `BoardColumn`, `KanbanCard`), no shadcn / radix / dnd-kit. The wired,
  drag-and-drop board lives in `services/web/src/app/(authed)/kanban/`.

## Key concepts

- **Ordering** — columns and cards each carry an integer `position` assigned in
  **gaps of 10** (the house pattern from `data-models`' `reorderDataFields`). A
  reorder sends the full ordered id list and rewrites positions in a
  transaction ; `moveCard` re-columns a card and reindexes its target column.
- **Per-board RBAC** — a board with no `KanbanBoardRoleAccess` rows is visible to
  everyone ; otherwise only the granted roles see it. `kanban.manage` bypasses
  the table (mirrors `Calendar` + `CalendarRoleAccess`).
- **Soft delete** — boards and cards carry `deletedAt` (archive / restore) ;
  columns hard-delete and cascade their cards.
- **Dependency scoping** — the `client/` primitives are framework-pure so the web
  bundle can consume them ; interaction (dnd-kit) and shadcn dialogs live in
  `services/web`.

## Public API

| Export                                            | From         | Purpose                                             |
| ------------------------------------------------- | ------------ | --------------------------------------------------- |
| `kanbanRouter`                                    | `/server`    | tRPC router (`boards` / `columns` / `cards`)        |
| `registerKanbanPermissions()`                     | `/server`    | registers `kanban.{view,create,edit,delete,manage}` |
| `registerKanbanEventTypes()`                      | `/server`    | registers the webhook-picker descriptions           |
| `registerKanbanFeatureFlags()`                    | `/server`    | registers the `kanban.board` + `kanban.query` flags |
| `registerKanbanNotificationKinds()`               | `/server`    | registers the `kanban.card.assigned` kind           |
| `registerKanbanNotificationSubscriber()`          | `/server`    | notifies the assignee on `card-assigned`            |
| `createBoard` / `moveCard` / `reorderColumns` / … | `/server`    | data-layer helpers                                  |
| `BoardArea` / `BoardColumn` / `KanbanCard`        | `/client`    | presentation primitives                             |
| `BoardDef` / `BoardColumnDef` / `CardItem`        | `/contracts` | domain types                                        |
| `KanbanEvents`                                    | `/contracts` | domain-event union                                  |

## Data model

Prisma models under the `// ── MODULE: kanban ──` banner in this module's own
fragment [`prisma/kanban.prisma`](prisma/kanban.prisma) (assembled into the
generated `schema.prisma`) — migrations
`20260725200201_add_kanban` ; `20260726023411_kanban_card_fields` ; `20260726040000_kanban_card_multi_assignee` ; `20260727150000_kanban_card_multi_reviewer` ; `20260727170000_kanban_card_subtasks` ; `20260808020000_kanban_card_blocks` ; `20260808030000_kanban_drop_subtasks`:

- **`KanbanBoard`** — org-scoped, soft-deleted ; `name`, `description` (short text), `color`.
- **`KanbanBoardRoleAccess`** — `(boardId, roleId)` per-board role grant.
- **`KanbanColumn`** — `boardId`, `name`, `color`, `position`, `wipLimit?`.
- **`KanbanCard`** — `boardId`, `columnId`, `title`, `description` (a BlockNote
  block array stored as `Json`) + `descriptionText` (its plain-text projection via
  `blocksToText`, which the query language filters on), `assigneeIds`
  - `reviewerIds` (text arrays, each may hold **many** members, order-preserving),
    `dueAt?`, `priority?` (`KanbanCardPriority` enum : LOW / MEDIUM / HIGH /
    CRITICAL), `estimate?` (Int), `position`, soft-deleted. `assigneeIds` /
    `reviewerIds` are org-member userIds (not FKs, resolved for display by the web).
    A card's **checklist lives in the block body** (`checkListItem` blocks) ; the
    card-face progress bar derives from them via `checklistProgress` (the dedicated
    `subtasks` column was dropped).
- **`KanbanView`** — a saved MonarkQL query per board : `boardId`, `name`,
  `query` (`FilterNode` JSON), `shared`, `createdBy` ; migration
  `20260803140000_add_kanban_views`.

## Events emitted

`kanban.board-created`, `kanban.column-created`, `kanban.card-created`,
`kanban.card-updated` (carries a `changed` array over `title` / `description` /
`assignee` / `reviewer` / `dueAt` / `priority` / `estimate`, and the full
`assigneeIds`), `kanban.card-moved` (carries `fromColumnId` / `toColumnId`),
`kanban.card-deleted`, `kanban.card-assigned` (per newly-added assignee ; carries
`boardName` / `cardTitle` / `assigneeId`).
Registered for the webhook picker via `registerKanbanEventTypes()`, so every one
is subscribable with no webhook code.

## Notifications

`registerKanbanNotificationKinds()` registers the `kanban.card.assigned` kind
(category `ACTIVITY`, in-app default-on + email default-off, en + fr templates).
`registerKanbanNotificationSubscriber()` binds a subscriber to
`kanban.card-assigned` → `notify()` the assignee (self-assignment skipped). The
payload type is declaration-merged in [`contracts/notifications.ts`](src/contracts/notifications.ts),
activated by a side-effect import in `server/index.ts`.

## Feature flags

`registerKanbanFeatureFlags()` registers `kanban.board` (default-on) and `kanban.query` (default-off). The web route 404s and the primary-nav entry hides when `kanban.board` resolves `false` ; `kanban.query` gates the MonarkQL query bar and the `cards.list` filter.

## tRPC surface

- `boards.{list, get, create, update, delete, restore}` — `get` returns the board
  plus its columns and cards (the board view's single load).
- `columns.{create, update, delete, reorder}`.
- `cards.{create, update, move, delete}` — `move` takes the full ordered card-id
  list for the target column ; `update` also accepts an optional `columnId` (the
  card form's **status** select) that moves the card to the end of that column and
  emits `kanban.card-moved`, exactly as a drag does.
- `cards.search` — title match across the caller's accessible boards (scoped by
  the same row-level rule as `boards.list`), returning each card's board name.
  Powers the global command palette's kanban results.
- `cards.list` — a board's cards AND-ed with an optional MonarkQL `filter` tree
  (`@monark/query`), compiled to a Prisma `where` by `server/query-compiler.ts`
  (`compileKanbanFilter`). Fields : `title` / `description` (text), `status`
  (columnId), `assignee` / `reviewer` (id arrays), `priority` (ordered enum —
  `>=HIGH`), `due` (date), `estimate` (number), `created` / `updated`. Gated by
  `kanban.view` + board access ; `@variables` (`@me`, `@today`, …) resolve on the
  server. Behind the `kanban.query` flag.
- `views.{list, create, update, delete}` — **saved views** : a named `filter`
  tree per board (`KanbanView`), personal or `shared` to everyone with board
  access, editable only by its owner. Reading gates on `kanban.view` + board
  access ; `list` returns a `mine` flag. Parity with data-models' record views.
- `members` — active org members for the assignee picker + avatar resolution.

Every mutation guards with `requirePermission(ctx, "kanban.<key>", orgId)` and
emits its domain event.

## Not yet

- **WIP-limit enforcement** — the per-column limit is _advisory_ : the board shows
  `N / limit` (red over the cap) but doesn't block moves.
- Card **labels** and board **filtering**.
