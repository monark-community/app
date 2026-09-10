# Workspace ; one nested content tree

> Phase C of the integration program, and its umbrella. Siblings:
> [views-system.md](views-system.md) (Phase B, what a view is),
> [access-control-console.md](access-control-console.md) (Phase A's authoring half),
> [automation-model-refs.md](automation-model-refs.md) (Phase D),
> [integrations-rework.md](integrations-rework.md) (Phase E).
>
> **Source**: transcribes the approved program plan of 2026-09-07 and its product decisions of
> 2026-09-08, re-verified against the code on 2026-09-10. Locked decisions are recorded, not
> re-opened.

## Context

The platform grew four user-facing content surfaces independently, each with its own container, its
own navigation, and its own per-object access table:

| Section     | Container                      | Contents                      | Per-object access       |
| ----------- | ------------------------------ | ----------------------------- | ----------------------- |
| `/data`     | `DataModel`                    | `DataRecord` rows             | `DataRecordRoleAccess`  |
| `/wiki`     | `WikiPage` (nested, adjacency) | BlockNote document            | org-wide RBAC only      |
| `/kanban`   | `KanbanBoard`                  | `KanbanColumn` / `KanbanCard` | `KanbanBoardRoleAccess` |
| `/calendar` | `Calendar`                     | `CalendarEvent`               | `CalendarRoleAccess`    |

The driving complaint, in the operator's words: _"a lot of power under the hood, but features live
in silo."_ A user cannot put an article next to the database it documents, and cannot order the two
against each other, because there is no shared place for them to live.

## Goals

- **Articles and Databases in one ordered, nestable, drag-reorderable tree.**
- **`/workspace`** as the section that renders it, mounting `SectionShell`.
- **Kind-agnostic and core-owned**, so a fifth kind is a module change and not a core change.
- **Nothing loses its home**: every live wiki page and data model gets a node, preserving the wiki's
  existing parentage and order.

## Locked decisions (do not re-litigate)

- **The section is Workspace** (`/workspace`), owned by a new **core** module `@monark/workspace`.
- **The `wiki`, `kanban` and `data` nav entries are removed outright and their routes deleted.
  No redirect shims.** Reconfirmed 2026-09-10. The consequence is handled rather than discovered:
  see [Re-pointing what embedded a URL](#re-pointing-what-embedded-a-url).
- **Calendar keeps its own top-level entry** _and_ is also available as a view type on a database,
  the way Notion keeps a Calendar surface alongside database calendar views. Personal calendars, ICS
  import/export and the 60-second reminder sweep are not database-shaped and stay where they are.
- **Title and icon are not denormalized onto the node.** They are resolved by each kind's
  `resolve(ctx, targetIds)` in one batched call per kind, so the whole tree is still a single flat
  load with nothing to keep in sync.
- **A node whose target the caller cannot read is omitted, and its children re-parent to the nearest
  visible ancestor** in the projection. Dropping the subtree would make a readable child under an
  unreadable parent unreachable.

## Non-goals

- **Per-node ACLs as a new mechanism.** The tree does not invent an access model ; each kind's
  resolver self-scopes, and Phase A's record scoping applies underneath, unchanged.
- **Records as tree nodes.** A database's _rows_ are not nodes ; they are reached inside the
  database. A database node may, however, have child articles, which is how "documentation next to
  the data" works.
- **Notion parity**: no inline databases inside a page body, no synced blocks, no page-level
  permissions.

## User stories

- **As a member**, I open Workspace and see one tree of folders, articles and databases in an order
  someone chose.
- **As an editor**, I use the **New** dropdown and pick _Article_ or _Database_ ; it lands where I
  am and I am in it.
- **As an editor**, I drag a node onto another to nest it, or between siblings to reorder.
- **As an editor**, I put an article under a database, because it documents that database.
- **As a member without access to a database**, that database is simply absent from my tree, and any
  article beneath it that I _can_ read is still reachable.

## The load-bearing decision: where the tree lives

The tier rules decide it. `@monark/wiki` is **extended**, `@monark/data-models` is **core** ; an
extended module may not own a table core depends on, and core may not reference an extended
fragment. So neither "put `parentId` on `DataModel`" nor "generalize `WikiPage`" is legal. The tree
must be **core-owned and kind-agnostic**.

A small new **core** module `@monark/workspace`, owning one table plus a registry:

```prisma
model ContentNode {
  id             String        @id @default(cuid())
  organizationId String
  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  parentId       String?
  parent         ContentNode?  @relation("ContentTree", fields: [parentId], references: [id], onDelete: SetNull)
  children       ContentNode[] @relation("ContentTree")
  /// A registered kind key, e.g. "wiki.article" | "data-models.database".
  kind           String
  /// Soft id into the owning module's table (house convention, no cross-module FK).
  targetId       String
  position       Int           @default(0)
  deletedAt      DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@unique([kind, targetId])
  @@index([organizationId, parentId, position])
}
```

`registerContentKind(module, { kind, label, icon, resolve, canCreate })` follows the same
register-at-boot shape as `registerSearchSource`, `registerModelIntegration` and
`registerAutomationNodes`. Wiki registers `wiki.article` ; data-models registers
`data-models.database` ; anything else joins later with no core change.

**RBAC on a whole-tree load.** Each kind's `resolve` self-scopes (its own `requireOrg` plus
`requirePermission` or accessible-id resolution), exactly as search sources already do.

**Note on `@@unique([kind, targetId])` and soft deletes.** A plain unique reserves a soft-deleted
node's target id forever. Use the partial-index convention already used for
`DataModel_org_key_active_unique` (`WHERE "deletedAt" IS NULL`), written by hand in the migration.

## Drag and drop

Reuse the **existing, already-correct** `wiki.pages.move({ id, newParentId, beforeId? })` semantics
for `workspace.nodes.move`. That is the right contract over `cards.move`'s `orderedIdsInTarget`,
because a deep tree makes a full ordered-id payload large, and because `beforeId` is already
implemented and tested server-side.

Worth knowing: **the wiki UI has never exercised it.** `wiki-shell.tsx:212` hardcodes
`beforeId: null`, so sibling reordering is unreachable from the UI today even though the server
supports it. Wiring drag-and-drop is therefore a pure client change against an existing mutation.

Ordering keeps the house pattern: integer `position` in gaps of 10, whole sibling list densely
renumbered to `(i+1)*10` inside a `$transaction`, identical to `movePage`, `moveCard` and
`dataFields.reorder`.

DnD uses `@dnd-kit`, copied from the working implementation in `kanban-board-view.tsx`. The one
genuinely new interaction is **drop-between versus drop-into** in a tree, which needs a hit-zone
split on each row (upper and lower thirds reorder, middle third reparents) plus an
auto-expand-on-hover timer.

## The shell

The biggest structural obstacle, named plainly: **only `/data`, `/admin` and `/account` mount
`SectionShell`.** `/wiki`, `/kanban`, `/calendar` and `/automation` each hand-roll their own layout ;
`app/(authed)/wiki/layout.tsx` builds its own `h-[calc(100dvh-57px)] flex flex-col overflow-hidden`
box and `WikiShell` renders its own `<aside>` plus a mobile `Sheet`. Route-to-section mapping is pure
`startsWith` on `PrimaryNavEntry.href` ; there is no registry keying a section to a tree provider.

- New section `/workspace`, mounting `SectionShell` with the `ContentNode` tree as its `sidebar`.
- `PRIMARY_NAV` gains one `workspace` entry ; `wiki`, `kanban` and `data` are removed.
- Global search's "Go to" group derives from `PRIMARY_NAV`, so it follows automatically.

`/automation` adopts `SectionShell` too, but that happens once in
[integrations-rework.md](integrations-rework.md) (Phase E.5), and this phase inherits the pattern
rather than doing it twice.

## The "New" CTA

Top of the tree: a dropdown, not a single action. Items come from the kind registry's `canCreate`,
so the menu grows with registered kinds rather than being hardcoded. **Article** and **Database** in
v1.

Creating a Database creates the `DataModel` (with its reserved `title` field), a default **TABLE**
view, and the `ContentNode`, in one transaction.

## Re-pointing what embedded a URL

Deleting the old routes without shims is the locked call, so the audit is part of the work, not a
follow-up. Anything holding a `/data/models/...`, `/wiki/...` or `/kanban?board=` URL points at a
dead route after this phase:

- **Every module's `registerSearchSource`**, whose hrefs are built **server-side** and must emit the
  new routes. This is the largest and most mechanical part.
- **Notification templates** that deep-link a record, page or card.
- **Stored automation-node config** that builds a link (a `send-email` or `notification` node body
  with an interpolated URL). These are rows, not code, so they need a data pass or a documented
  operator step, not just a code change.
- The user guide and technical documentation, which name routes throughout.

External bookmarks and already-delivered notification emails will 404. That is the accepted cost of
the no-shims decision ; it is worth stating in the release notes rather than discovering in support.

## Sequencing

Each slice is independently valuable and flag-gated (`workspace.enabled`, default off until C4):

1. **C1** ; the `@monark/workspace` module, `ContentNode`, the kind registry, and the backfill
   migration. Tree read-only, rendered nowhere.
2. **C2** ; `/workspace` with `SectionShell`, the tree sidebar and DnD. Wiki and data-models both
   reachable through it ; old sections still work.
3. **C3** ; the New dropdown and view-type switching. Needs [Phase B](views-system.md).
4. **C4** ; `PRIMARY_NAV` cleanup, the href re-pointing audit above, old sections retire.
5. **C5** ; kanban materialization and write-back ([views-system.md](views-system.md)).
6. **C6** ; calendar range slot and write-back ([views-system.md](views-system.md)).

C5 and C6 can land in parallel with C2 to C4 ; they touch disjoint files.

## Dependencies

- **Shipped and required**: Data Models, MonarkQL, the block editor, the global-search registry,
  `SectionShell`, `DragHandle`, `wiki.pages.move`, the record-scope work of `2026-09-08`.
- **Blocking**: [views-system.md](views-system.md) for C3 ; the access console should land before C4,
  since retiring `/kanban` removes the only editor for `KanbanBoardRoleAccess`.

## Edge cases and risks

- **A node whose target vanished.** Deleting a `DataModel` must cascade its node ; the registry is
  the seam. A reconciliation sweep is worth having regardless, because a raw SQL delete or a restore
  from backup can always desync a soft reference.
- **Two writers reordering the same sibling list.** The dense renumber runs in a transaction ; ties
  break on `id` so the result is deterministic rather than merely non-crashing.
- **Tree size.** The flat load plus in-app walking is fine for thousands of nodes. Name
  `WITH RECURSIVE` as the graduation path in a comment ; measure before building it.
- **The re-parenting projection.** "Omit the node, re-parent its children to the nearest visible
  ancestor" is easy to get subtly wrong when two levels are hidden. It deserves its own unit test
  over a hand-built tree, separate from the integration test.
- **i18n.** Three sections' worth of keys collapse into one. A key missing from _both_ locales still
  passes `check:i18n`, so the risk here is dead keys rather than missing ones ; sweep both catalogs
  in the same commit.

## Success metrics

- One tree holds articles and databases, ordered against each other.
- Three route trees deleted rather than hidden, with the href audit done and no dead internal link.
- Adding a fifth kind touches one module and `server.ts`, and no core file.
- The backfill produces one node per live `WikiPage` and per live `DataModel`, preserving wiki
  parentage and order.

## Out of scope (named fast-follows)

- **A view block inside a document** ; embedding a view in an article body. The block editor already
  stores JSON blocks and a view already has a stable id, so this is a block type plus a renderer.
- **Templates**, **trash view**, **favourites and recents** in the sidebar.
- **Per-node sharing** ; access stays role- and scope-based.
