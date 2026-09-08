# Shape

An org owns many **boards** ; a board owns ordered **columns** ; a column owns
ordered **cards**. Cards drag between columns. Like the calendar, the module
owns its Prisma models directly in the shared `schema.prisma` under the
`// ── MODULE: kanban ──` banner (`KanbanBoard`, `KanbanBoardRoleAccess`,
`KanbanColumn`, `KanbanCard` ; migrations `20260725200201_add_kanban`,
`20260726023411_kanban_card_fields`, `20260726040000_kanban_card_multi_assignee`,
`20260727150000_kanban_card_multi_reviewer`, `20260727170000_kanban_card_subtasks`,
`20260808020000_kanban_card_blocks`, `20260808030000_kanban_drop_subtasks`).
Boards and cards soft-delete (`deletedAt`) ;
columns hard-delete and cascade their cards.

A **card** carries `title`, `description` (a BlockNote **block array**, `Json`) +
`descriptionText` (its plain-text projection via `blocksToText`, kept in sync on
write so the query language filters on it), `assigneeIds` / `reviewerIds` (text
arrays : a card can have **many** assignees and **many** reviewers ; org-member
userIds, not FKs), `dueAt?`,
`priority?` (`KanbanCardPriority` : LOW / MEDIUM /
HIGH / CRITICAL : a severity-graded colour, `KANBAN_PRIORITY_COLOR` in
`contracts/types.ts` driving a faded-tint badge on the card + in the editor
picker, matching the Data-Models select badges), and `estimate?` (Int). A card's
**checklist lives in the block body** now (BlockNote `checkListItem` blocks) :
the old dedicated `subtasks` column was dropped. Estimate + priority render as
chips on the card, and **checklist progress** renders as a thin **progress bar
flush with the card's bottom edge** (blue while in progress, green when complete ;
the card is `overflow-hidden` so the bar clips to the rounded corners, exact
`done/total` on its title/aria), derived from the description's checklist blocks
via `checklistProgress` (`@monark/common/blocks`). The whole card opens the
editor on click.

> **`description` JSON gotcha + drag activation.** The `Json` column surfaces as
> the recursive `Prisma.JsonValue` ; on the already-wide `KanbanCard` row that
> pushed tRPC's **output** type inference past tsc's instantiation-depth limit
> (TS2589). Fix: `KanbanCardRow` overrides `description` to `unknown` (data.ts),
> and every reader coerces it (the block editor casts to `Block[]`, the card face
> reads it through `checklistProgress`). Drag activation is input-aware : a `MouseSensor` starts on a 6px move
> (so a click stays a click), while a `TouchSensor` needs a ~250ms **long-press**
> before dragging : a quick touch swipe pans/scrolls the board instead (the card
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
