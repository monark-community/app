# 4. Extensions (non-core modules)

### 4.1 Calendar (`@monark/calendar`)

Org-scoped named/colored calendars with per-role access.

- **Models** (own fragment): `Calendar` (`isPersonal` protected from deletion), `CalendarRoleAccess`, `CalendarEvent` (`eventType`: `STANDARD` | `PUNCTUAL` | `ALL_DAY` ; additive `sourceModule`/`sourceRecordId` unique pair for materialized events), `CalendarEventReminder`.
- **Views**: Day (hourly timeline), Week, Month, Agenda (all shipped ; mobile collapses Week/Month to Day). Drag-move/resize via Pointer Events. ICS import (capped 500) + export (`/calendar/export`).
- **Data Models materialization**: declares two integration slots (`time`, `calendarRef`) ; a subscriber on `data-models.record-*` upserts a `CalendarEvent` keyed on `(sourceModule, sourceRecordId)` ; records that stop satisfying the mapping soft-delete their event, re-satisfying un-deletes. This is the first consumer of the model-integration slot registry.
- **Permissions**: `calendar.{view, create, edit, delete, manage}` (+ two metadata-sidecar perms for per-user view settings). **Notification kind**: `calendar.event.reminder` (IN_APP), fired by the 60s reminder sweep. **Feature flag**: none ; Calendar is always on. **tRPC**: `calendar.calendars.*`, `calendar.events.*` (incl. `checkConflicts`, `search`, `import/exportIcs`), `calendar.settings.*`.

### 4.2 Kanban (`@monark/kanban`)

Boards, columns, and cards ; a board maps to a project/workflow, a column to a status, a card to a task.

- **Models** (own fragment): `KanbanBoard`, `KanbanBoardRoleAccess` (no rows = public to the org ; else granted roles ; `kanban.manage` bypasses), `KanbanColumn` (`position` in gaps of 10, advisory `wipLimit`), `KanbanCard` (`assigneeIds`/`reviewerIds` as member-id arrays, `dueAt`, `priority` `LOW|MEDIUM|HIGH|CRITICAL`, `estimate`, `subtasks` JSON, `position`).
- **Board view**: drag-and-drop via `@dnd-kit` (sortable columns + cards) ; card editor with rich-text description + subtasks ; WIP overage shown but not blocked.
- **MQL**: `cards.list` accepts an MQL filter tree compiled to a typed Prisma `where` (`compileKanbanFilter`) : fields `title/description/status/assignee/reviewer/priority(ordered)/due/estimate/created/updated`, with `@me`/`@today`. Gated by flag `kanban.query` (default off ; enforced in the web layer). Kanban does **not** integrate with Data Models.
- **Permissions**: `kanban.{view, create, edit, delete, manage}`. **Events**: `kanban.board-created`, `column-created`, `card-created`/`updated`/`moved`/`deleted`/`assigned`. **Notification kind**: `kanban.card.assigned` (IN_APP on, EMAIL off) via a subscriber on `kanban.card-assigned`. **Flags**: `kanban.board` (default on, kill switch) + `kanban.query` (default off). **tRPC**: `kanban.boards.*`, `columns.*`, `cards.*`, `members`.

---
