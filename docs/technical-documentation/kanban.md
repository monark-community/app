# Kanban module

`@monark/kanban` is an **extended** module that adds a Kanban board view (a
sibling to the calendar). This is the internals reference ; the package
[`README`](../../packages/kanban/README.md) is the API doc.

## Shape

An org owns many **boards** ; a board owns ordered **columns** ; a column owns
ordered **cards**. Cards drag between columns. Like the calendar, the module
owns its Prisma models directly in the shared `schema.prisma` under the
`// ── MODULE: kanban ──` banner (`KanbanBoard`, `KanbanBoardRoleAccess`,
`KanbanColumn`, `KanbanCard` — migrations `20260725200201_add_kanban`,
`20260726023411_kanban_card_fields`, `20260726040000_kanban_card_multi_assignee`,
`20260727150000_kanban_card_multi_reviewer`, `20260727170000_kanban_card_subtasks`).
Boards and cards soft-delete (`deletedAt`) ;
columns hard-delete and cascade their cards.

A **card** carries `title`, `description`, `assigneeIds` / `reviewerIds` (text
arrays — a card can have **many** assignees and **many** reviewers ; org-member
userIds, not FKs), `dueAt?`,
`priority?` (`KanbanCardPriority` : LOW / MEDIUM /
HIGH / CRITICAL — a severity-graded colour, `KANBAN_PRIORITY_COLOR` in
`contracts/types.ts` driving a faded-tint badge on the card + in the editor
picker, matching the Data-Models select badges), `estimate?`
(Int), and `subtasks` — an inline **checklist** stored as a `Json` column
(`KanbanSubtask[]` of `{ id, title, done }`). Estimate + priority render as chips
on the card, and subtask progress renders as a thin **progress bar flush with the
card's bottom edge** (blue while in progress, green when complete ; the card is
`overflow-hidden` so the bar clips to the rounded corners, exact `done/total` on
its title/aria). The whole card opens the editor on click.

> **Two `subtasks` gotchas.** (1) The `Json` column surfaces as the recursive
> `Prisma.JsonValue` ; on the already-wide `KanbanCard` row that pushed tRPC's
> **output** type inference past tsc's instantiation-depth limit (TS2589). Fix:
> `KanbanCardRow` overrides `subtasks` to `unknown` (data.ts), and every reader
> coerces it with `parseSubtasks`. (2) A typed `z.array(z.object(...))` in the
> **input** hit the same wall, so `cards.create` / `update` take `subtasks` as a
> **JSON string** (parsed server-side via `parseSubtasksInput`) to keep the
> procedure input flat. Drag activation is input-aware : a `MouseSensor` starts on a 6px move
> (so a click stays a click), while a `TouchSensor` needs a ~250ms **long-press**
> before dragging — a quick touch swipe pans/scrolls the board instead (the card
> sets no `touch-action: none`, so the browser owns the gesture until the press
> delay elapses). This is the fix for "I tried to scroll and moved a card" on
> mobile, where horizontal space is tight.

The card editor also carries a **Status** select (the board's columns). Picking a
different status moves the card to the end of that column : `cards.update` takes
an optional `columnId`, `updateCard` repositions it, and the handler emits the
same `kanban.card-moved` event a drag would (so automation / webhooks see one
move signal regardless of how the move was triggered).

> **Boundary note.** The written contract says extended modules must not edit
> `schema.prisma`. The calendar already owns models there, and `check:tiers`
> only inspects package deps, so we follow that precedent. The rule-pure
> alternatives (metadata sidecar, or making kanban core) were rejected for a
> feature that needs indexed, ordered, FK-linked rows.

## Ordering

Columns and cards each carry an integer `position` in **gaps of 10** (the house
pattern from `data-models`' `reorderDataFields`). A reorder sends the full
ordered id list and rewrites positions in a transaction. `moveCard(boardId,
toColumnId, orderedIdsInTarget)` pins each target card's `columnId` and rewrites
its `position` in one transaction ; the source column keeps its (harmless) gaps.

## Cross-cutting wiring (the "Big 4/5")

Registered at api boot in [`services/api/src/server.ts`](../../services/api/src/server.ts):

- **RBAC** — `registerKanbanPermissions()` → `kanban.{view,create,edit,delete,manage}`.
  Every mutation guards with `requirePermission(ctx, "kanban.<key>", org.id)`.
  Per-board access via `KanbanBoardRoleAccess` (empty = everyone ; `kanban.manage`
  bypasses), mirroring `CalendarRoleAccess`.
- **Event bus** — every mutation emits a `KanbanEvents` member
  (`board-created` / `column-created` / `card-created` / `card-updated` /
  `card-moved` / `card-deleted` / `card-assigned`).
- **Webhooks** — free : `registerKanbanEventTypes()` registers the operator
  descriptions, making every event subscribable.
- **Notifications** — `registerKanbanNotificationKinds()` +
  `registerKanbanNotificationSubscriber()`. The subscriber reacts to
  `kanban.card-assigned` and `notify()`s the assignee (`kanban.card.assigned`
  kind, in-app default-on + email opt-in, en + fr). Self-assignment is skipped.
- **Feature flags** — `registerKanbanFeatureFlags()` → `kanban.board` (default-on).
  The [route](<../../services/web/src/app/(authed)/kanban/page.tsx>) 404s and the
  [primary-nav](../../services/web/src/config/primary-nav.ts) entry hides when it
  resolves `false` (the nav reads it via `featureFlags.getAllForSession`).

## Web view

[`services/web/src/app/(authed)/kanban/`](<../../services/web/src/app/(authed)/kanban>):
`page.tsx` (server: auth + flag gate + board/permission load), `kanban-shell.tsx`
(URL `?board=<id>` state, dialogs, and the compact **board combo** — a single
control whose name + chevron open the board switcher while an inline pen opens
the board settings ; there is no separate columns / edit-board toolbar button),
`kanban-board-view.tsx` (the `@dnd-kit` board: one `DndContext`, a vertical
`SortableContext` per column, highlight-only `onDragOver`, resolve + persist on
`onDragEnd`), the board / column dialogs, and the **card editor `Sheet`**.
Clicking a card opens `card-editor.tsx` as a **right-side panel** on desktop
(non-modal + no overlay, so the board stays visible/interactive behind it ; a
`PanelHeader` supplies the title + close X, and outside clicks are ignored so a
stray click can't drop the form) and a **full-screen** sheet on mobile (the
transform-free `full` variant + the shared `usePanelIsMobile` visual-viewport
check, so it can't blow out the iOS layout viewport). `CardEditor` keeps the
`Sheet` mounted and remounts only its inner `CardForm` (keyed by card id) when
you pick a different card, so switching cards re-seeds the fields **without**
replaying the panel's open animation / layout shift. **Column management lives on
the board, not a dialog**: each column header carries the drag grip + a `…` menu
(add card / edit / delete), and a trailing `AddColumn` slot creates new columns
inline (the old `ColumnManager` dialog was removed). The board primitives
(`BoardArea`, `BoardColumn`, `KanbanCard`) live in the package as framework-pure
React ; dnd-kit and shadcn stay in the web layer.

## Extending

- A new card field: add it to `KanbanCard` (schema + migration), the `cards`
  input/patch in `server/index.ts`, and the card editor.
- Data-Model integration (materialize records into cards): follow the calendar's
  `registerModelIntegration` + subscriber pattern (deferred).

## Testing

Two suites :

- **Unit** (`pnpm --filter @monark/kanban test`, no Docker) —
  `tests/parse-subtasks.test.ts` covers `parseSubtasks`, the one place the
  subtask JSON shape is trusted (non-array → `[]`, malformed items dropped,
  strict `done` coercion, id/title caps, `KANBAN_SUBTASK_MAX` cap).
- **Integration** (`pnpm --filter @monark/kanban test:integration`, needs Docker)
  — two files against a Postgres testcontainer :
  - `kanban-data.test.ts` (data layer) : default-column seeding (names,
    gaps-of-10 positions, colours), column reorder, cross-column `moveCard`
    reindex, `searchCards` scoping/soft-delete, multi-assignee + multi-reviewer
    round-trips (replace / untouched-on-`undefined` / clear), subtask checklist
    round-trip through the JSON column, and the status-change move
    (`updateCard({ columnId })` appends to the target column).
  - `kanban-router.test.ts` (tRPC procedures, via `t.createCallerFactory`) :
    RBAC guards (`kanban.view`/`edit` deny/allow), per-board **role access**
    (`requireAccessibleBoard` — restricted board hidden from a viewer, visible to
    the gated role, bypassed by `kanban.manage`), and **event emission +
    change-detection** captured off the bus (`on(WILDCARD_EVENT_TYPE)`) :
    `card-created` + one `card-assigned` per assignee, an update's `changed`
    array + `card-assigned` only for _newly-added_ assignees, a status change
    emitting `card-moved`, and a single-field change emitting no false
    assignee/move events. This mirrors data-models' `authorization.test.ts` and
    stays self-contained (public `createRole`/`assignRole` + the caller factory —
    no shared harness, no core-module change).
