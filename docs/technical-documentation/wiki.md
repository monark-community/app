# Wiki module

`@monark/wiki` is an **extended** module that adds a Notion-like nested wiki (a
sibling to the calendar / kanban / data surfaces). This is the internals
reference ; the package [`README`](../../packages/wiki/README.md) is the API doc.

## Shape

An org owns a single **tree of pages**. The module owns one Prisma model in its
own fragment `packages/wiki/prisma/wiki.prisma` under the `// ── MODULE: wiki ──`
banner (`WikiPage` ; migration `20260807063256_add_wiki_pages`), assembled into
the generated `schema.prisma` by `pnpm gen:schema`. Pages soft-delete
(`deletedAt`).

A **page** carries `title`, `icon?` (an emoji), `content` (a BlockNote block
array stored as `Json`, default `[]`) + `contentText` (its plain-text projection
via `blocksToText`, kept in sync on write so search stays a cheap text
`contains`), a nullable `parentId` (self-relation, `onDelete: SetNull`),
and an integer `position`. The `@@index([organizationId, parentId, position])`
serves the sibling-ordered tree read.

## The tree is an adjacency list, walked in app code

There is no `WITH RECURSIVE`. Every tree operation loads the org's flat page list
(a light `{ id, parentId, … }` projection) and walks it in memory :

- **Ancestors** (`getAncestors`) — follow `parentId` up from a page, guarding
  against a self-referential loop, and reverse to root-first for the breadcrumb.
- **Subtree** (`collectSubtree`) — build a `parentId → children[]` map, then DFS
  from the root collecting ids. Used by move (the cycle-guard), soft-delete, and
  restore.

Per-org wikis are small enough that loading the flat list is cheaper than a
recursive query ; graduate to a CTE only if a wiki ever grows very large. The
projection is capped implicitly by org size, not paginated — a deliberate
exception to the list-pagination rule, since the sidebar renders the whole tree.

## Ordering and moves

Siblings hold a `position` in **gaps of 10** (the house pattern from kanban /
data-models). `createPage` appends at `max(position) + 10` within its parent.
`movePage`:

1. Collects the moved page's subtree and **rejects** a target parent inside it
   (`ValidationError`) — the cycle-guard that keeps the tree acyclic.
2. In a transaction, loads the target parent's sibling list (excluding the moved
   page), splices the moved page in **before `beforeId`** (or appends when null /
   unknown), and rewrites every sibling's `position` to `(i + 1) * 10`.

The moved page's own subtree rides along untouched ; only its `parentId` changes.

## Delete / restore

`softDeleteSubtree` stamps `deletedAt` on the whole subtree and returns the id
list ; `restoreSubtree` clears it (walking the tree with `includeDeleted` so it
can find the buried descendants). The `wiki.page-deleted` event carries the full
`pageIds[]` so subscribers see the fan-out, not just the root.

## Big-5

- **RBAC** — `wiki.read` / `create` / `update` / `delete`, registered at boot ;
  every mutation gates through the matching capability. No per-page ACL in v1
  (org-wide access), a conscious scope choice.
- **Events** — `wiki.page-created` / `-updated` (with a `changed[]` of
  title / icon / content) / `-moved` (from → to parent) / `-deleted`. Registered
  event types make them webhook-subscribable for free.
- **Feature flag** — `wiki.enabled` (`defaultOn: false`) ; the route's server
  gate `notFound()`s when off, and the nav entry hides. Enabled on the dev
  instance via `tools/enable-dev-flags.ts`.
- **Notifications** — none in v1 (no user-facing signal a wiki edit needs to push).

## Automation

Two-directional, mediated entirely by the core event bus + registries (the wiki
router has zero automation coupling):

- **Triggers** are free — the four registered `wiki.page-*` event types show up
  in the automation trigger picker automatically (the picker enumerates the
  shared event-type registry), so a flow can start on any wiki change.
- **Actions** — `server/nodes.ts` registers three action nodes via
  `@monark/automation`'s `registerAutomationNodes("wiki", …)` (wired at api boot):
  `wiki.create-page`, `wiki.update-page`, `wiki.delete-page`. They mirror the
  built-in Data Record nodes exactly : resolve the automation owner, gate on that
  owner's own `wiki.*` permission (`hasPermission`, so a node can't do what its
  owner couldn't in the UI), call the data layer directly, and — like those nodes
  — **emit no wiki events** (a flow can't re-trigger itself). Text bodies convert
  to blocks via `textToBlocks` (`@monark/common/blocks`). `@monark/automation` is
  a **core** module, so wiki depending on it is a normal extended→core edge (no
  `integrates` flag ; that's only for extended→extended).

## Web

The section lives in `services/web/src/app/(authed)/wiki` : a server `layout.tsx`
gates on the flag + `wiki.read`, fetches the tree + the caller's permissions, and
renders a client `WikiShell` (the tree sidebar, mobile drawer, and the
move / delete dialogs) around the page editor (`WikiPageView` — icon + title
inputs, the shared `BlockEditor` — BlockNote, uncontrolled so mobile IME/Enter
isn't disrupted — with debounced autosave). Discoverability is
wired through `PRIMARY_NAV` (drawer + "Go to" palette) and a `SEARCH_PROVIDERS`
content provider backed by `wiki.pages.search`.
