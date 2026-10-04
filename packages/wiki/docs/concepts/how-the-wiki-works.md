---
type: concept
---

# How the wiki works

Each organization has one tree of wiki pages. A page points at its parent, and every tree operation (breadcrumb, move, delete) loads the organization's flat page list and walks it in application code. Everything else follows from that one choice.

## Pages and the tree

A page has a title, an optional emoji icon, a body, a nullable parent and an integer position among its siblings. A page with no parent is top level. The module owns one table, `WikiPage`, in its own schema fragment (`packages/wiki/prisma/wiki.prisma`).

The body is a block-editor document stored as JSON. On every write the server also stores a plain-text projection of it, so search and change detection read a text column instead of walking JSON.

The sidebar loads the light shape of every live page (`id`, `parentId`, `title`, `icon`, `position`) in one query and builds the tree in the browser. Bodies load one page at a time. The list isn't paginated: the sidebar renders the whole tree, and a wiki's page count stays small enough for that.

## Walking the tree

There is no recursive SQL. Two helpers in `packages/wiki/src/server/data.ts` cover every case:

- **Ancestors** follow `parentId` upward from a page, with a guard against loops, and give the breadcrumb root first.
- **Subtree** builds a parent-to-children map and walks it depth first. Move, delete and restore all use it.

Why in memory rather than a recursive query: see [Walk the wiki page tree in application code](../decisions/0012-walk-the-wiki-tree-in-app-code.md).

## Order and moves

Siblings are ordered by `position`, assigned in steps of 10, the same pattern Kanban and data models use. A new or duplicated page goes to the end of its parent's list.

A move first collects the moved page's subtree and rejects a target inside it, which keeps the tree free of cycles. Then, in one transaction, it renumbers the target parent's children with the moved page inserted. Only the moved page's `parentId` changes; its own subtree comes along untouched. The server accepts a "before this sibling" position, but the app's **Move to…** dialog always appends.

## Delete and restore

Deleting a page soft-deletes its whole subtree in one update and returns every id it removed. The `wiki.page-deleted` event carries that full list, so subscribers see every removed page, not only the root. Restore walks the tree including deleted pages and clears the whole subtree again. Restore exists on the server only; the app has no control for it.

## Access, events and automations

Four permissions gate the wiki: read, create, update (which includes moving) and delete (which includes restoring). They apply organization-wide; there are no per-page permissions. The whole module sits behind the `wiki.enabled` flag, which is off by default: when it's off, the route returns not found and the navigation entry is hidden.

Each change emits a domain event: `wiki.page-created`, `wiki.page-updated` (with which of title, icon or content changed), `wiki.page-moved` (from and to parent) and `wiki.page-deleted`. Registering their event types makes them available to webhooks and as automation triggers with no extra code.

The wiki also registers three automation action nodes: create, update and delete a page. Each checks that the flow's owner has the matching wiki permission, calls the data layer directly and emits no wiki event, so a flow can't trigger itself. Text written by a flow is converted to blocks on the way in.

Wiki pages join the global search palette through a registered search source. It matches title and body text with typo-tolerant trigram matching, scoped to the caller's organization and read permission.

## Limits

- No per-page access control.
- No notifications: nothing tells a user that a page changed.
- Duplicate copies one page, not its subpages.
- Pages can't be reordered among their siblings from the app, and deleted pages can't be restored from it.

## Related

- [Wiki user guide](../use/_index.md)
- Module README: `packages/wiki/README.md` (API, data model, tRPC surface)
- [How automations run](../../../../docs/concepts/automations.md)
- [Domain events](../../../../docs/reference/events.md) and [Feature flags](../../../../docs/reference/feature-flags.md)
