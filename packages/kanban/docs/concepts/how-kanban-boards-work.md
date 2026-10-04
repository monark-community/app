---
type: concept
---

# How Kanban boards work

An organization owns boards, a board owns ordered columns, and a column owns ordered cards. Order is an integer position, and every way of moving a card ends in the same server call and the same domain event, so other modules see one signal however the card was moved.

## Boards, columns and cards

The module owns its tables in its own schema fragment (`packages/kanban/prisma/kanban.prisma`): `KanbanBoard`, `KanbanBoardRoleAccess`, `KanbanColumn`, `KanbanCard` and `KanbanView`. A new board gets six columns: Backlog, Todo, In Progress, Review, QA and Done.

A card's assignees and reviewers are arrays of organization member ids, not foreign keys, so the module doesn't depend on the users table's shape; the web resolves them for display. Priority is an enum (low to critical). Due date and estimate are optional.

The card body is a block-editor document stored as JSON, plus a plain-text projection written alongside it on every save. Filtering on the description reads the text column, not the JSON. A card's checklist is the checklist blocks in that body; the progress bar on the card face is derived from them, so there is no separate subtask table.

Boards and cards are soft-deleted. Columns are hard-deleted and take their cards with them.

## Order and moves

Columns and cards carry a `position` in steps of 10, the house pattern shared with data models and the wiki. A reorder sends the full ordered id list and rewrites positions in one transaction. Moving a card sends the target column's full ordered card list; the server pins each card to that column and renumbers it. The source column keeps its gaps, which do no harm.

There are two ways to move a card, and they converge:

- **Drag** on the board calls the move procedure.
- **Status** in the card editor updates the card with a new column. The server appends it to the end of that column.

Both emit `kanban.card-moved`, so automations and webhooks don't need to know which one happened.

On the board, drag starts differently by input. A mouse drag starts after 6 pixels of movement, so a click stays a click. A touch drag needs a long press of about 250 ms; a quick swipe scrolls the board instead of moving a card.

## Who sees a board

Five permissions gate the module: view, create, edit, delete and manage. On top of them, a board can be limited to roles through `KanbanBoardRoleAccess`. A board with no rows there is visible to everyone; otherwise only the listed roles see it. The manage permission bypasses the restriction. This mirrors how calendars are restricted. Search, filtering and saved views all apply the same board-access rule.

The module is behind the `kanban.board` flag, on by default. When it's off, the route returns not found and the navigation entry is hidden.

## Filtering and saved views

The board's query bar uses the shared query language. The server compiles the filter tree into a typed Prisma `where` (`server/query-compiler.ts`), and resolves variables such as `@me` and `@today` there. Priority is an ordered field, so `priority:>=HIGH` expands to the matching set of values. Filtering sits behind a second flag, `kanban.query`, which is off by default; with it off, the board loads every card and hides the query bar.

A saved view stores a named filter for one board. It's personal unless shared, and only its creator can change it.

## Events and notifications

Every change emits a domain event: board, column and card created, card updated (with the list of fields that changed), card moved, card deleted, and card assigned. Their registered event types make them available to webhooks and automations without extra code.

`kanban.card-assigned` fires once per newly added assignee, not for people already on the card. A subscriber turns it into an in-app notification (email if the person opts in), and skips you when you assign yourself.

Cards also join the global search palette through a registered search source, matching title and description with typo-tolerant trigram search across the boards the caller can see.

## Limits

- Column card limits are advisory: the board shows the count against the limit but never blocks a move.
- The app has no control to restore a deleted board or card. The server can restore a board; deleted cards stay deleted.
- Cards have no labels, and there is no list view of cards.
- Records from a data model can't be turned into cards.

## Related

- [Kanban user guide](../use/_index.md)
- [Query syntax](../../../../docs/reference/query-syntax.md)
- [Domain events](../../../../docs/reference/events.md) and [Feature flags](../../../../docs/reference/feature-flags.md)
- Module README: `packages/kanban/README.md` (API, data model, tRPC surface)
