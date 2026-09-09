# Testing

Two suites :

- **Unit** (`pnpm --filter @monark/kanban test`, no Docker) : the MonarkQL
  filter compiler (`tests/query-compiler.test.ts`, incl. the `description` filter
  now targeting the `descriptionText` projection) and the query-fields kind map.
  (The card's checklist derivation is unit-tested at its source, `checklistProgress`
  in `@monark/common`.)
- **Integration** (`pnpm --filter @monark/kanban test:integration`, needs Docker)
  ; two files against a Postgres testcontainer :
  - `kanban-data.test.ts` (data layer) : default-column seeding (names,
    gaps-of-10 positions, colours), column reorder, cross-column `moveCard`
    reindex, `searchCards` scoping/soft-delete, multi-assignee + multi-reviewer
    round-trips (replace / untouched-on-`undefined` / clear), the block-array
    `description` + its `descriptionText` projection round-trip, and the
    status-change move (`updateCard({ columnId })` appends to the target column).
  - `kanban-router.test.ts` (tRPC procedures, via `t.createCallerFactory`) :
    RBAC guards (`kanban.view`/`edit` deny/allow), per-board **role access**
    (`requireAccessibleBoard` ; restricted board hidden from a viewer, visible to
    the gated role, bypassed by `kanban.manage`), and **event emission +
    change-detection** captured off the bus (`on(WILDCARD_EVENT_TYPE)`) :
    `card-created` + one `card-assigned` per assignee, an update's `changed`
    array + `card-assigned` only for _newly-added_ assignees, a status change
    emitting `card-moved`, and a single-field change emitting no false
    assignee/move events. This mirrors data-models' `authorization.test.ts` and
    stays self-contained (public `createRole`/`assignRole` + the caller factory :
    no shared harness, no core-module change).
