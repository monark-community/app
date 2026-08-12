# Wiki (nested pages)

## Context

The platform has a broad feature set (data models, kanban, calendar, automation, chat, public API) but no place to write and organize freeform knowledge — runbooks, specs, meeting notes, onboarding guides. A Notion-style **wiki** with a nested page tree fills that gap. Most of the pieces already exist: the Tiptap rich-text editor (sanitized HTML + `RichTextView`), the shared `DragHandle` + dnd-kit reorder used by kanban, the split-shell layout pattern (calendar/kanban), and the module conventions (Big-5 + gen:module). The one genuinely new build is a **collapsible page tree** and the subtree/move logic behind it.

This spec is **v1**: an org-wide, rich-text wiki with a nested tree. It is deliberately scoped below full Notion parity (see Non-goals). It will be built as an **extended** module `@monark/wiki`, flag-gated behind `wiki.enabled`.

## Goals

- **Nested pages**: every page can have a parent, forming a tree of arbitrary depth. Top-level pages have no parent.
- **Rich content**: reuse the existing `RichTextEditor` (sanitized HTML), with debounced **autosave** (Notion-style, no explicit Save).
- **Tree sidebar**: a persistent, collapsible left tree — expand/collapse, add-child, rename, drag to reorder + reparent, delete.
- **Deep links**: each page has a shareable URL (`/wiki/<id>`); breadcrumbs walk the ancestor chain.
- **Org-wide access via RBAC**: any member with `wiki.read` sees the tree; `wiki.create` / `update` / `delete` gate writes.
- **Discoverable + searchable**: a primary-nav entry (auto-added to the ⌘K palette) and a global-search provider matching page title + content.
- **Big-5 wired**: RBAC, domain events (→ webhooks free), a feature flag. Notifications (watch-page) are a conscious v1 N/A.

## Non-goals (v1 — fast-follows noted)

- **Block editor** — draggable blocks, slash-menu blocks, toggles, columns, database embeds. This is Notion's real differentiator and a large editor track of its own; v1 uses the existing rich-text editor. (v3)
- **Internal `@page` links + backlinks panel** — a Tiptap mention extension linking pages, with a backlinks view. (v2)
- **Per-page / teamspace access control** — Notion-style per-page sharing. v1 is org-wide RBAC; per-page ACL mirrors the data-models visibility-resolver pattern later. (v2/v3)
- **Version history**, **templates**, **page-level comments** (the `DiscussionSection` pattern could attach later), **watch/notify**. (v2+)
- **Subtree duplicate** — v1 `duplicate` copies a single page; recursive copy is v2.

## User stories

- **As a member**, I open the wiki, see a tree of pages in the sidebar, click one, and read it. I can expand/collapse branches.
- **As an editor**, I hover a page and click **+** to add a child; I type a title and content, and it autosaves as I go.
- **As an editor**, I drag a page onto another to nest it, or between siblings to reorder — the tree updates immediately.
- **As an editor**, I rename or delete a page from its **⋯** menu; deleting a page removes its whole subtree (with a confirm), and I can restore it.
- **As anyone**, I press ⌘K, type a page title or a phrase from its content, and jump straight to it.
- **As a member without write access**, I can read every page but see no add/edit/delete affordances.

## Data model

One table, in the module's own fragment `packages/wiki/prisma/wiki.prisma` (extended modules never touch `base.prisma`):

```prisma
// ── MODULE: wiki ──
model WikiPage {
  id             String    @id @default(cuid())
  organizationId String
  parentId       String?                              // null = top-level page
  parent         WikiPage? @relation("WikiTree", fields: [parentId], references: [id])
  children       WikiPage[] @relation("WikiTree")
  title          String
  icon           String?                              // emoji or lucide key
  content        String    @default("")               // sanitized HTML (RichTextView renders it)
  position       Int       @default(0)                // sibling order — steps of 10, like kanban cards
  createdBy      String
  updatedBy      String?
  deletedAt      DateTime?                            // soft-delete a whole subtree
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([organizationId, parentId, position])
}
```

**Tree strategy — adjacency list, walked in-app.** The sidebar loads every non-deleted page's light shape (`{ id, parentId, title, icon, position }`) for the org in one query and builds the tree client-side (wikis are small — titles only, content loaded per page). Subtree operations (descendants for the move cycle-guard, and delete/restore) are computed by **walking that in-memory tree** and issuing a bulk `updateMany` over the collected ids — no recursive CTE or raw SQL. A comment marks where a `WITH RECURSIVE` would graduate this if a wiki ever grows very large.

**Ordering** reuses the kanban pattern (`packages/kanban/src/server/data.ts`): integer `position` in steps of 10 per sibling group, rewritten in a transaction on reorder.

## Package layout (mirrors `@monark/kanban`)

```
packages/wiki/
  prisma/wiki.prisma
  src/
    contracts/  types.ts · events.ts · index.ts
    server/     data.ts · permissions.ts · flags.ts · event-types.ts · router.ts · index.ts
                (notification-kinds.ts + notification-subscriber.ts → v2)
    client/     index.ts        // light shared types/constants for the web app
  README.md
  tests/integration/  pages.test.ts
```

## Server surface (`trpc.wiki.pages.*`)

| Procedure                                 | Type     | Gate          | Notes                                                                                                                            |
| ----------------------------------------- | -------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tree`                                    | query    | `wiki.read`   | Light nodes for the org sidebar (no content).                                                                                    |
| `get({ id })`                             | query    | `wiki.read`   | Full page + `ancestors[]` for the breadcrumb. 404 if deleted / other org.                                                        |
| `create({ parentId?, title?, afterId? })` | mutation | `wiki.create` | Default title "Untitled"; appended to siblings. Emits `page-created`.                                                            |
| `update({ id, title?, icon?, content? })` | mutation | `wiki.update` | Patch. The editor calls this debounced (autosave). Emits `page-updated`.                                                         |
| `move({ id, newParentId, beforeId? })`    | mutation | `wiki.update` | Reparent + reorder. Rejects moving a page under its own descendant (cycle guard). Reindex siblings in a txn. Emits `page-moved`. |
| `delete({ id })`                          | mutation | `wiki.delete` | Soft-deletes the whole subtree. Emits `page-deleted`.                                                                            |
| `restore({ id })`                         | mutation | `wiki.delete` | Restores the subtree.                                                                                                            |
| `duplicate({ id })`                       | mutation | `wiki.create` | Copies the page (single page in v1).                                                                                             |
| `search({ query })`                       | query    | `wiki.read`   | Title + content match, org-scoped — for the global-search provider.                                                              |

**`server/data.ts`** functions: `listPagesForOrg` (light), `getPage`, `getAncestors`, `createPage`, `updatePage`, `movePage` (descendant check off the loaded tree), `softDeleteSubtree`, `restoreSubtree`, `duplicatePage`, `searchPages`, `reindexSiblings`. Every query scopes on `organizationId` via `requireOrg(ctx)`.

## The four integration systems (Big-5)

- **RBAC** — `registerWikiPermissions()`: `wiki.read` / `create` / `update` / `delete` (category "Wiki"). ADMIN/SYSADMIN auto-grant. Guard every mutation with `requirePermission`.
- **Event bus** — `WikiEvents` union in `contracts/events.ts` (`wiki.page-created` / `-updated` / `-moved` / `-deleted`), joined via `pnpm gen:events`; `registerWikiEventTypes()` gives operator-facing descriptions so **webhooks are subscribable for free**.
- **Notifications** — **v1 N/A** (conscious). v2 adds a watch-page kind + subscriber (mirror the data-models record-watch).
- **Feature flags** — `registerWikiFeatureFlags()`: `wiki.enabled` (`defaultOn: false`). Enable in dev via `pnpm enable:dev-flags` (add the key to that tool's `DEV_FLAGS`).
- **Webhooks** — free once the events are registered.

## Web UI (`app/(authed)/wiki/…`)

The Next layout owns the persistent tree; the page segment renders content, so navigating between pages keeps the sidebar mounted.

- **`layout.tsx`** — gate on the `wiki.enabled` flag + `wiki.read` permission (mirror `data/layout.tsx`); renders `WikiShell` (tree sidebar) around `{children}`.
- **`[pageId]/page.tsx`** — the selected page (deep-linkable `/wiki/<id>`).
- **`page.tsx`** (index) — empty state / "New page" CTA / redirect to a first page.

Components:

- **`wiki-tree.tsx`** — the one new build: a collapsible tree (dnd-kit sortable + nesting, the shared `DragHandle`), per-row hover **+** (add child) and **⋯** (rename / move / delete via `ConfirmDialog`), expand/collapse persisted per-browser, active-row highlight.
- **`wiki-page-view.tsx`** — icon (emoji) + title input + breadcrumb (from `ancestors`) + the existing `RichTextEditor` with **debounced autosave**; optimistic tree updates for title/icon.
- **`wiki-search-provider.tsx`** — a `SearchProvider` (mirror `kanban-search-provider.tsx`).

Reused wholesale: `RichTextEditor` / `RichTextView`, `DragHandle`, `ConfirmDialog`, `@monark/files` (cover / inline images), the mobile-safe primitives.

## Discoverability, i18n, docs, tests

- **Nav**: a `PRIMARY_NAV` entry (`{ id: "wiki", href: "/wiki", icon: BookText }`) — auto-adds it to the ⌘K "Go to" list. **Search**: a `SEARCH_PROVIDERS` entry backed by the gated `wiki.pages.search`.
- **i18n**: a `wiki.*` namespace, en + fr (nav label, empty states, action + dialog copy, search heading). Event / permission / flag _descriptions_ stay canonical English per `docs/agents/i18n.md`.
- **Docs**: `packages/wiki/README.md` (What's here / Key concepts / Public API / Data model / Events / tRPC), a `docs/user-guide/wiki` page, and `docs/technical-documentation/wiki.md` (tree model + move/delete semantics).
- **Tests**: `tests/integration/pages.test.ts` — CRUD, **move cycle-guard rejection**, **subtree soft-delete + restore**, RBAC deny-without-permission, search org-scoping. (`check:modules` requires this suite for a module with a router.)

## Build order

1. Scaffold module (`pnpm gen:module wiki`) → manifest (extended) → fragment schema → migration.
2. Contracts (types + events union) → `pnpm gen:events`.
3. Server: `data.ts` (tree ops + reindex), permissions, flags, event-types, router, index → wire `register*` into `services/api/src/server.ts` → `pnpm gen`.
4. Web: layout gate → `WikiShell` + `wiki-tree` (dnd) → `wiki-page-view` + autosave editor → move/delete actions.
5. `PRIMARY_NAV` + search provider + `pages.search`.
6. i18n (en + fr).
7. README + user/dev docs.
8. Integration suite.
9. Pre-PR gate (`gen && typecheck && lint && test && check:tiers && check:modules && check:i18n`) → flip `wiki.enabled` on in dev.

## Engineering care-points

- **Move cycle guard** — reject reparenting a page into its own descendant.
- **Subtree consistency** — delete/restore stamp the _whole_ subtree; a deep-link to a soft-deleted / other-org page returns a clean 404 / empty.
- **Sibling reindex in a transaction** (steps of 10) so concurrent reorders don't collide.
- **Autosave** — debounce; reconcile optimistic tree title/icon with the server echo.
- Org scoping on every read; content is already sanitized by the rich-text pipeline (dompurify).

## Effort

v1 is module-shaped and mostly wiring already done many times across the codebase; the only novel build is the dnd tree sidebar and the subtree/move logic. Ballpark: a solid multi-day feature. Once shipped, the as-built truth moves to `packages/wiki/README.md` per the docs convention, and this spec becomes historical.
