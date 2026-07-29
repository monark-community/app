# @monark/kanban

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
| `registerKanbanFeatureFlags()`                    | `/server`    | registers the `kanban.board` flag                   |
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
`20260725200201_add_kanban` + `20260726023411_kanban_card_fields`:

- **`KanbanBoard`** — org-scoped, soft-deleted ; `name`, `description`, `color`.
- **`KanbanBoardRoleAccess`** — `(boardId, roleId)` per-board role grant.
- **`KanbanColumn`** — `boardId`, `name`, `color`, `position`, `wipLimit?`.
- **`KanbanCard`** — `boardId`, `columnId`, `title`, `description`, `assigneeIds`
  - `reviewerIds` (text arrays, each may hold **many** members, order-preserving),
    `dueAt?`, `priority?` (`KanbanCardPriority` enum : LOW / MEDIUM / HIGH /
    CRITICAL), `estimate?` (Int), `subtasks` (a `Json` checklist —
    `KanbanSubtask[]` of `{ id, title, done }`, coerced with `parseSubtasks`),
    `position`, soft-deleted. `assigneeIds` / `reviewerIds` are org-member userIds
    (not FKs, resolved for display by the web).

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

`registerKanbanFeatureFlags()` registers `kanban.board` (default-on). The web
route 404s and the primary-nav entry hides when it resolves `false`.

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
- `members` — active org members for the assignee picker + avatar resolution.

Every mutation guards with `requirePermission(ctx, "kanban.<key>", orgId)` and
emits its domain event.

## Not yet

- **WIP-limit enforcement** — the per-column limit is _advisory_ : the board shows
  `N / limit` (red over the cap) but doesn't block moves.
- Card **labels** and board **filtering**.
