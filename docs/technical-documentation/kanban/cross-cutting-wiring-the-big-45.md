# Cross-cutting wiring (the "Big 4/5")

Registered at api boot in [`services/api/src/server.ts`](../../../services/api/src/server.ts):

- **RBAC** : `registerKanbanPermissions()` → `kanban.{view,create,edit,delete,manage}`.
  Every mutation guards with `requirePermission(ctx, "kanban.<key>", org.id)`.
  Per-board access via `KanbanBoardRoleAccess` (empty = everyone ; `kanban.manage`
  bypasses), mirroring `CalendarRoleAccess`.
- **Event bus** : every mutation emits a `KanbanEvents` member
  (`board-created` / `column-created` / `card-created` / `card-updated` /
  `card-moved` / `card-deleted` / `card-assigned`).
- **Webhooks** : free : `registerKanbanEventTypes()` registers the operator
  descriptions, making every event subscribable.
- **Notifications** : `registerKanbanNotificationKinds()` +
  `registerKanbanNotificationSubscriber()`. The subscriber reacts to
  `kanban.card-assigned` and `notify()`s the assignee (`kanban.card.assigned`
  kind, in-app default-on + email opt-in, en + fr). Self-assignment is skipped.
- **Feature flags** : `registerKanbanFeatureFlags()` → `kanban.board` (default-on).
  The [route](<../../../services/web/src/app/(authed)/kanban/page.tsx>) 404s and the
  [primary-nav](../../../services/web/src/config/primary-nav.ts) entry hides when it
  resolves `false` (the nav reads it via `featureFlags.getAllForSession`).
