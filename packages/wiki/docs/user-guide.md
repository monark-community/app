# Wiki — user guide

End-user guide for the Wiki module (`@monark/wiki`, an extended module). It lives with the package on purpose : remove the module and its docs go with it. It's linked from the central [user guide index](../../../docs/user-guide/_index.md) ; developer details are in the [module README](../README.md).

Reach the wiki from the **Wiki** entry in the navigation rail (visible where the feature is enabled). The wiki is a **tree of pages** shared across your organization : anyone with wiki access sees the same pages. Each page has an optional **icon**, a **title**, and a body you write in a **block editor** : press **`/`** for the block menu (headings, lists, checklists, quotes, and more), use the **drag handle** to reorder blocks, and **Tab** to nest.

## The page tree

The left sidebar is the page tree. Top-level pages sit at the root ; any page can hold **sub-pages**, nested as deep as you like. Click the chevron to expand or collapse a branch ; the tree remembers what you had open, and auto-expands to reveal the page you're viewing.

- **New page** (top of the sidebar) creates a page at the root.
- Hovering a page reveals a **+** to add a sub-page under it, and a **⋯** menu for the rest.

## Editing a page

Click a page to open it. The breadcrumb across the top shows its place in the tree. Set the **icon** (any emoji) and the **title** at the top, then write the body below. Everything **saves automatically** as you type ; there's no save button. If you don't have edit permission, the page opens read-only.

## Moving, duplicating, deleting

From a page's **⋯** menu :

- **Move to…** opens a picker of every possible new parent (or **Top level**). A page can't be moved under itself or one of its own sub-pages. Moving a page brings its whole sub-tree along.
- **Duplicate** makes a copy of the page as a new sibling (the copy's sub-pages are not included).
- **Delete** removes the page **and all of its sub-pages**. You're asked to confirm first, because the whole branch goes at once.

## Finding a page

Open the command palette (the global search) while you're in the wiki and start typing : pages whose **title or content** matches show up under **Pages**, and selecting one jumps straight to it.

## Who can do what

Access is governed by your role. Separate permissions cover **reading**, **creating**, **editing**, and **deleting** pages ; an administrator has them all. There are no per-page permissions in this version : if you can edit the wiki, you can edit any page in your organization.
