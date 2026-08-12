# @monark/wiki

A Notion-like nested wiki : a tree of pages per organization, each with an icon,
a title, and a block-editor body (BlockNote, stored as a JSON block array).
Pages nest arbitrarily deep via
an adjacency list ; the tree is walked in application code (no recursive CTE),
which stays cheap for the per-org tree sizes a wiki realistically holds.

Extended module. Gated behind the `wiki.enabled` feature flag (off by default).

## What's here

- **`/contracts`** — the wire types and domain events. `WikiTreeNode` /
  `WikiAncestor` (the light shapes the sidebar + breadcrumb render from), the
  `WIKI_*_MAX` field bounds, and the `WikiEvents` union
  (`created` / `updated` / `moved` / `deleted`).
- **`/server`** — the data layer (`src/server/data.ts`), the tRPC router
  (`wikiRouter`, mounted at `trpc.wiki.*`), and the boot-time registrations
  (permissions, feature flag, event types).
- **`/client`** — reserved ; the web UI lives in `services/web` under
  `app/(authed)/wiki` (server-gated section shell + tree sidebar + page editor).

## Key concepts

- **Adjacency list, walked in app code.** A page carries a nullable `parentId`
  and an integer `position`. Ancestors, subtree collection, and the move
  cycle-guard all walk the org's flat page list in memory rather than issuing a
  `WITH RECURSIVE`. Graduate to a recursive CTE only if a wiki ever grows large.
- **Sibling `position` in gaps of 10.** The house ordering pattern (kanban /
  data-models). Inserting or moving a page renumbers only its own sibling list,
  inside a transaction ; the moved page's subtree rides along (only its
  `parentId` changes).
- **Move cycle-guard.** `movePage` rejects reparenting a page under itself or one
  of its descendants (`ValidationError`), so the tree can never form a cycle.
- **Soft delete by subtree.** Deleting a page soft-deletes its whole subtree
  (`deletedAt`) and returns every removed id ; `restoreSubtree` is the inverse.
  The deleted-event payload carries the full id list so subscribers see the fan-out.
- **Org-wide access via RBAC.** v1 has no per-page ACL : a member who holds a
  `wiki.*` permission can act on every page in their org. Reads and writes scope
  to `ctx.organizationId` at the router.

## Public API

`@monark/wiki/server`

| Export                             | Kind        | Purpose                                                 |
| ---------------------------------- | ----------- | ------------------------------------------------------- |
| `wikiRouter`                       | tRPC router | Mounted at `trpc.wiki.pages.*` (see below).             |
| `listPagesForOrg(orgId)`           | fn          | Non-deleted pages, light shape, ordered for the tree.   |
| `findPageById(id, opts?)`          | fn          | One page (optionally including soft-deleted).           |
| `getAncestors(orgId, pageId)`      | fn          | Root-first ancestor chain (breadcrumb).                 |
| `createPage(input)`                | fn          | Create a page, appended to its sibling list.            |
| `updatePage(id, patch)`            | fn          | Patch title / icon / content.                           |
| `movePage(input)`                  | fn          | Reparent + reorder, with the cycle-guard.               |
| `softDeleteSubtree(orgId, rootId)` | fn          | Soft-delete a page + subtree ; returns removed ids.     |
| `restoreSubtree(orgId, rootId)`    | fn          | Restore a soft-deleted subtree.                         |
| `duplicatePage(source, createdBy)` | fn          | Copy one page as a new sibling.                         |
| `searchPages(orgId, query)`        | fn          | Title + content match (powers the palette).             |
| `registerWikiPermissions()`        | fn          | Registers the `wiki.*` capabilities at boot.            |
| `registerWikiFeatureFlags()`       | fn          | Registers the `wiki.enabled` flag at boot.              |
| `registerWikiEventTypes()`         | fn          | Registers the operator-facing event descriptions.       |
| `registerWikiAutomationNodes()`    | fn          | Registers the `wiki.*` automation action nodes at boot. |
| `WikiPageRow`                      | type        | The full row shape returned by the data layer.          |

`@monark/wiki/contracts` — `WikiTreeNode`, `WikiAncestor`, `WikiEvents` (+ member
event types), and the `WIKI_TITLE_MAX` / `WIKI_CONTENT_MAX` / `WIKI_ICON_MAX` bounds.

## Data model

One table, owned by this module's fragment `prisma/wiki.prisma` under the
`// ── MODULE: wiki ──` banner (assembled into `schema.prisma` by `pnpm gen:schema`).

- **`WikiPage`** — `id`, `organizationId` (FK, cascade), `parentId` (self-FK,
  `SetNull`), `title`, `icon?`, `content` (a `Json` block array, default `[]`) +
  `contentText` (its plain-text projection via `blocksToText`, kept in sync on
  write so search stays a cheap text `contains`), `position`,
  `createdBy` / `updatedBy`, `deletedAt?`, timestamps. Indexed on
  `(organizationId, parentId, position)` for the sibling-ordered tree read.

Migrations : `20260807063256_add_wiki_pages` ; `20260808010000_wiki_content_blocks`
(`content` HTML → block-array `Json` + the derived `contentText`).

## Events emitted

Declared in `contracts/events.ts`, part of the `DomainEvent` union via `pnpm gen:events`,
and subscribable by webhooks once registered :

- `wiki.page-created` — a new page.
- `wiki.page-updated` — title / icon / content changed (`changed[]` says which).
- `wiki.page-moved` — reparent / reorder (`fromParentId` → `toParentId`).
- `wiki.page-deleted` — a page + its subtree soft-deleted (`pageIds[]`).

No events consumed.

## tRPC surface

`trpc.wiki.pages.*` — `tree`, `get`, `create`, `update`, `move`, `delete`,
`restore`, `duplicate`, `search`. Every mutation gates through a `wiki.*`
permission and emits the matching domain event.

## Automation integration

Two-directional, both event-bus / registry mediated (no automation coupling in
the router):

- **Triggers (free).** Because the four `wiki.page-*` events are registered event
  types, they appear automatically in the automation trigger picker — a flow can
  start on any wiki change, with the event fields as `{{ trigger.* }}` outputs.
- **Actions.** `registerWikiAutomationNodes()` (`server/nodes.ts`, wired at api
  boot) contributes three action nodes under the `wiki` namespace via
  `@monark/automation`'s `registerAutomationNodes`: **`wiki.create-page`**,
  **`wiki.update-page`**, **`wiki.delete-page`**. Each resolves the automation
  owner and gates on that owner's own `wiki.create` / `.update` / `.delete`
  permission (`hasPermission`), then calls the data layer directly. Bodies are
  plain text (one paragraph per line, via `textToBlocks`). Like the built-in Data
  Record nodes, they do **not** emit wiki events (so a flow can't re-trigger
  itself). `@monark/automation` is a **core** module, so this is a normal
  extended→core dependency (no `integrates` needed).
