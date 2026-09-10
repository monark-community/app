# Workspace unification ; one content tree

> **Program umbrella.** This spec owns the _tree_ and the _section_. Its two siblings own the
> pieces that hang off it: [views-system.md](views-system.md) (what a saved view is, and how
> Kanban and Calendar become view types) and
> [access-control-console.md](access-control-console.md) (where access to any of it is
> configured). Read this one first.

## Context

The platform grew four user-facing content surfaces independently, and each one invented its own
container, its own navigation, and its own per-object access table:

| Section     | Container                      | Contents                      | Per-object access       |
| ----------- | ------------------------------ | ----------------------------- | ----------------------- |
| `/data`     | `DataModel`                    | `DataRecord` rows             | `DataRecordRoleAccess`  |
| `/wiki`     | `WikiPage` (nested, adjacency) | BlockNote document            | org-wide RBAC only      |
| `/kanban`   | `KanbanBoard`                  | `KanbanColumn` / `KanbanCard` | `KanbanBoardRoleAccess` |
| `/calendar` | `Calendar`                     | `CalendarEvent`               | `CalendarRoleAccess`    |

Four navigations, four mental models, four access stories, and three separate answers to "where
does this thing live". A user who wants to see their projects as a board and their deadlines on a
calendar has to keep the same information in three places, or wire the `DataModelIntegration`
slot-mapping bridge that only Calendar implements today.

The engine that makes the merge possible already shipped. Data Models is a real polymorphic
database with typed fields, relations, formulas, documents, files, MonarkQL filtering through
[one compiler](../../technical-documentation/data-model-queries/_index.md), saved views
(`DataRecordView`), row-level ACLs and, since `2026-09-08`,
[MonarkQL-scoped role permissions](../../technical-documentation/record-scopes.md). Kanban and
Calendar are, structurally, two _presentations_ of records that happen to own their own storage.

This spec unifies the four into a single **Workspace** section with one nested tree, in which a
user creates a **database** or an **article** anywhere they like, and _views_ the database however
they want.

## Goals

- **One section, one tree.** `/workspace` replaces `/data`, `/wiki`, `/kanban` and `/calendar` as
  the top-level destination. The sidebar is the wiki's nested tree, grown up: arbitrary depth,
  drag to reorder and reparent, collapse state persisted.
- **Two things a user creates**: a **database** (a Data Model) or an **article** (a document page).
  Everything else is a _view_ of a database, and lives in the tree next to it.
- **The tree is core**, and every node kind registers into it rather than being hardcoded. Adding
  a fifth kind later must be a module change, not a core change.
- **Nothing loses its home.** Every existing board, calendar, wiki page and data model appears in
  the new tree after migration, at a defensible place, with its access preserved.
- **Access moves out.** Per-object access tables stop being configured from inside the object's own
  screen; see [access-control-console.md](access-control-console.md).

## Non-goals

- **Per-node ACLs as a new mechanism.** The tree does not invent an access model. A node's
  visibility is its _target's_ visibility, resolved by the target's own module. The tree filters
  what it renders; it never grants.
- **Cross-org or public trees.** Public read-side surfaces stay the existing
  [public forms and boards](../../user-guide/data/records-that-arrive-from-a-public-form.md)
  feature; the tree is for members.
- **Notion parity.** No inline databases inside a page body, no synced blocks, no page-level
  permissions in this program. A `DATABASE_VIEW` block embedded in a document is the obvious
  fast-follow and is called out under Out of scope.
- **Retiring `@monark/wiki` or `@monark/kanban` as packages.** The modules stay; what changes is
  where their data lives and who owns the tree.

## User stories

- **As a member**, I open Workspace and see one tree: folders, articles and databases, mine and
  the org's, in an order someone chose.
- **As an editor**, I click **+** on any node and pick _Database_ or _Article_; the new node lands
  as a child of what I clicked, and I am in it.
- **As an editor**, I drag a database into a folder, or an article under another article, and the
  tree updates immediately without reloading the page.
- **As an analyst**, I open a database, switch it to a board grouped by Status, and save that as a
  view; the view appears in the tree under its database, and my colleague opens the same link and
  sees the same board.
- **As anyone**, I press ⌘K, type a name, and land on the node ; databases, articles and views all
  answer.
- **As a member without access to a database**, that database and its views are simply not in my
  tree ; nothing renders as "restricted" at the tree level.

## The load-bearing decision: where the tree lives

The tree cannot live in `@monark/wiki`. Wiki is an **extended** module, and
[the tier walls](../../technical-documentation/extensibility-contract/_index.md) forbid both
_core depending on extended_ and _extended depending on extended_. A tree owned by wiki could
never hold a Data Model (core) node, and Kanban and Calendar (extended) could never read it.

So the tree is a **new core module, `@monark/workspace`**, that owns tree shape and nothing else:

```prisma
// ── MODULE: workspace ──  (core ; base.prisma)
model WorkspaceNode {
  id             String        @id @default(cuid())
  organizationId String
  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  parentId String?
  parent   WorkspaceNode?  @relation("WorkspaceTree", fields: [parentId], references: [id], onDelete: SetNull)
  children WorkspaceNode[] @relation("WorkspaceTree")

  // The registered node kind ("page", "database", "view", "folder"). A soft
  // reference, resolved through the kind registry ; never an FK, so an
  // extended module can own a kind without core depending on it (same
  // convention as CalendarEvent.sourceModule / KanbanCard.assigneeIds).
  kind     String
  targetId String?

  // Denormalized for the sidebar : rendering the tree must not fan out one
  // query per kind. Written by the owning module through `syncNode`.
  label String
  icon  String?

  position  Int       @default(0)   // sibling order, steps of 10
  createdBy String
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?               // set on a whole subtree at once

  @@unique([kind, targetId])
  @@index([organizationId, parentId, position])
  @@index([organizationId, deletedAt])
}
```

**Adjacency list walked in app code**, exactly as `WikiPage` does today: the sidebar loads every
live node's light shape for the org in one query and builds the tree client-side; subtree
operations (the move cycle-guard, delete, restore) walk that in-memory tree and issue one bulk
`updateMany`. The comment marking where a `WITH RECURSIVE` would graduate this carries over. Trees
are per-org and small; the same reasoning that held for the wiki holds here.

**Ordering** is the house `position` in steps of 10 (kanban cards, data fields, wiki siblings).

### The kind registry

Core defines the extension point, modules fill it, mirroring
`registerSearchSource` / `registerAutomationNodes` / `registerModelIntegration`:

```ts
registerWorkspaceNodeKind("database", {
  label: "Database",
  icon: "Database",
  // Can this caller see the node's target ? The tree renders only what this returns true for.
  canRead: (ctx, targetId) => …,
  // Where does clicking it go ? Built server-side, like SearchHit.href.
  href: (targetId) => `/workspace/db/${targetId}`,
  // Cascade : the target is being deleted, drop its node (and vice versa).
  onTargetDeleted: …,
  // What may be created under this node ? Databases accept views ; articles accept articles.
  accepts: ["view"],
});
```

Registered at api boot in [`services/api/src/server.ts`](../../../services/api/src/server.ts)
next to the other `register*` calls. `@monark/data-models` registers `database`;
`@monark/wiki` registers `page`; the views module registers `view`; `workspace` itself owns
`folder` (a node with no target).

**Visibility is delegated, never duplicated.** `nodes.tree` resolves the caller's readable set by
calling each kind's `canRead` in one batched pass per kind, so a database hidden by a
[record scope](../../technical-documentation/record-scopes.md) or a per-object role table is
absent from the tree without the tree knowing what a scope is. A node whose target is unreadable
is dropped along with its subtree; a _folder_ whose children are all unreadable renders empty
rather than being hidden, because a folder carries no data of its own.

### Why not the alternatives

- **Generalize `WikiPage` into the tree.** Tempting (the table is already a tree) but it puts a
  core concern in an extended, flag-gated module. `wiki.enabled = false` would take the whole
  workspace with it.
- **Three tables, tree materialized in app code.** No new schema, but every reorder becomes a
  multi-table transaction and "which of these is before that one" has no single answer. Ordering
  across kinds is exactly the thing a shared table exists to express.
- **A `parentId` on each of `DataModel` / `WikiPage` / `KanbanBoard`.** Same problem, plus a
  cross-table `position` that nothing enforces.

## Section and routing

```
/workspace                      → the tree ; redirects to the last-opened node (cookie), else the first
/workspace/page/<nodeId>        → an article
/workspace/db/<nodeId>          → a database, in its default view
/workspace/view/<nodeId>        → a saved view (table / board / calendar)
```

Routing on the **node id**, not the target id, is deliberate: it gives one URL shape, lets the
shell resolve breadcrumbs from the ancestor chain in a single walk, and means a link keeps working
if a target is later re-pointed. The target id stays reachable for the public API, which addresses
models and records directly and is unaffected by this program.

Old paths (`/data/models/<key>`, `/wiki/<pageId>`, `/kanban`, `/calendar`) keep working as
**permanent redirects** resolved through the `@@unique([kind, targetId])` index. They are cheap,
and every existing bookmark, notification email and webhook payload in the wild carries one.

The section uses `SectionShell` for bounded-scroll chrome (the wiki and kanban hand-roll theirs
today; see the section-internal-scroll note in
[architecture](../../technical-documentation/architecture/_index.md)). One `PRIMARY_NAV` entry,
`workspace`, replaces the four; the removed entries' i18n keys go with them.

## The tree sidebar

Grown from the wiki's, which is the closest thing that exists:

- Expand / collapse per node, state persisted per browser (`localStorage`, per the house
  convention for per-viewer conveniences).
- Hover **+** creates a child; the picker offers what the parent `accepts`.
- Drag to reorder among siblings and to reparent, using the shared `DragHandle` and dnd-kit, with
  the cycle-guard walking the in-memory tree.
- **⋯** menu: rename, change icon, duplicate, move to, delete. Delete soft-deletes the subtree
  behind a `ConfirmDialog` and offers restore, as the wiki does.
- A filter box that narrows the tree to matching nodes plus their ancestors. Full search stays
  ⌘K / global search.
- Resizable, with the width persisted, reusing the panel-resize handle standard.
- **Mobile**: the tree is the drawer; selecting a node takes over the screen, matching the existing
  mobile shell conventions.

## Global search and events

`@monark/workspace` registers a **search source** for nodes themselves (name match, so a folder or
a view is jumpable), while the existing per-module sources keep answering for _contents_
(record titles, page bodies). Two sources, two groups in the palette, no overlap.

Domain events: `workspace.node-created`, `workspace.node-moved`, `workspace.node-renamed`,
`workspace.node-deleted`, `workspace.node-restored`, registered via `registerEventTypes` so
webhooks and automation get them for free. A move carries both the old and new parent id; that is
the one thing an external system reconciling a mirror of the tree cannot recompute.

## Phasing

Each phase is shippable and reversible on its own. The whole program sits behind
`workspace.unified-tree` (default off) until phase 4.

**Phase 1 ; the tree, alongside the old sections.** New core `@monark/workspace`, the
`WorkspaceNode` table, the kind registry, `database` + `page` + `folder` kinds, the
`/workspace` shell and sidebar. Migration backfills a node per live `DataModel` and per live
`WikiPage` (preserving the wiki's existing parent/position exactly, and grouping databases under a
"Databases" folder). `/data` and `/wiki` still work and stay authoritative; the new section is
flag-gated and read-mostly. **Exit**: both trees agree, and the flag can be flipped per user.

**Phase 2 ; views become nodes.** Lands with [views-system.md](views-system.md) phase 1: the
`view` kind, saved views appearing under their database, and the local-edit affordance. Kanban and
Calendar are untouched and still separate. **Exit**: a saved board view over a real database is
usable end to end.

**Phase 3 ; Kanban and Calendar migrate.** [views-system.md](views-system.md) phases 2 and 3.
Boards and calendars become views over models; their nodes replace their old containers in the
tree; the old sections redirect. **Exit**: no user-facing surface reads `KanbanBoard` or
`Calendar` except the migration itself.

**Phase 4 ; retire the old sections.** Delete `/data`, `/wiki`, `/kanban`, `/calendar` route
trees and their nav entries; flip the flag on by default; leave the redirects. The kanban and
calendar _tables_ stay for one release after this, read-only, then are dropped by a follow-up
migration ; the point is that a rollback in that window does not need a data restore.

## Dependencies

- **Shipped and required**: Data Models + `@monark/query` (MonarkQL), block editor (`DOCUMENT`
  fields, BlockNote), global search registry, `DataRecordView`, the record-scope work of
  `2026-09-08`, `SectionShell`, `DragHandle`, `PanelHeader`.
- **Concurrent**: [views-system.md](views-system.md) is a hard dependency for phases 2 and 3.
  [access-control-console.md](access-control-console.md) is independent but wants to land before
  phase 4, since retiring `/kanban` removes the only place `KanbanBoardRoleAccess` is editable.

## Edge cases and risks

- **A node whose target vanished.** Deleting a `DataModel` through the admin surface must cascade
  its node. `onTargetDeleted` in the registry is the seam; a sweep reconciles orphans (a node whose
  `canRead` throws "not found") and is worth having regardless, because a raw SQL delete or a
  restore-from-backup can always desync a soft reference.
- **Two writers reordering the same sibling list.** Positions in steps of 10 collide on a tie;
  the reorder writes its whole sibling group in a transaction, and ties break on `id` so the result
  is deterministic rather than merely non-crashing.
- **Tree size.** In-memory walking is fine for thousands of nodes and stops being fine somewhere
  past that. The sidebar query returns the light shape only, and the graduation comment names
  `WITH RECURSIVE` as the escape hatch; measure before building it.
- **Flag skew during phases 1 to 3.** Two sections can create content concurrently. Nodes are
  backfilled by migration _and_ kept in sync by the owning module on every create/rename/delete,
  so the old section keeps producing correct nodes; the new section is not a second writer of the
  target data.
- **`@@unique([kind, targetId])` and soft deletes.** A soft-deleted node holds its target id
  forever under a plain unique. Use the partial-index convention already used for
  `DataModel_org_key_active_unique` (`WHERE "deletedAt" IS NULL`), written by hand in the
  migration.
- **i18n**: four sections' worth of keys collapse into one; deleting keys from only one locale
  passes `check:i18n` if it is deleted from both, so the risk is dead keys rather than missing
  ones. Sweep both catalogs in the same commit.

## Success metrics

- One nav entry; four route trees deleted rather than hidden.
- Every board, calendar, page and database reachable from the tree after migration, with zero
  access regressions (asserted by an integration test that enumerates pre- and post-migration
  visibility per role).
- A user can build "my projects as a board, filtered to my team" without an admin.
- Adding a fifth node kind touches one module and `server.ts`, and no core file.

## Out of scope (named fast-follows)

- **`DATABASE_VIEW` blocks inside a document** ; embedding a view in an article body. The block
  editor already stores JSON blocks, and a view already has a stable node id, so this is a block
  type plus a renderer.
- **Templates** ; "new database from template", "new article from template".
- **Per-node sharing** ; Notion-style share-this-page. Access stays role- and scope-based.
- **Trash view** ; a section-wide list of soft-deleted nodes with restore. Today restore is
  per-node from the parent's menu.
- **Favourites / recents** in the sidebar.
