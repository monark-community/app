import { z } from "zod";
import type { InAppTool } from "./tools";

// In-app-only agent tools for the Wiki module (an extended, non-core module), so
// Chrysa can read, search, and organize wiki pages. Like the automation tools,
// these are NOT exposed over the public API / MCP — they call `caller.wiki.*`
// in-process as the user, gated by that user's wiki permissions
// (wiki.read / .create / .update / .delete); mutations are confirm-gated.
//
// Note: rich page CONTENT (BlockNote blocks) is intentionally read-only for the
// agent — it can read/summarize a page's content via wiki_get_page, but editing
// blocks is format-specific and left to the editor; the agent manages titles,
// icons, structure (parent/order), creation, and deletion.

export const wikiTools: InAppTool[] = [
  {
    name: "wiki_list_pages",
    description:
      "List the organization's wiki pages as a tree (id, title, icon, parentId). parentId null = a top-level page. Call this first to learn page ids and the structure before getting, moving, or updating a page.",
    mutates: false,
    inputSchema: z.object({}),
    run: (caller) => caller.wiki.pages.tree(),
  },
  {
    name: "wiki_get_page",
    description:
      "Fetch one wiki page by id, with its content and its root-first ancestor chain (breadcrumb). Use to read or summarize what a page says.",
    mutates: false,
    inputSchema: z.object({ id: z.string().min(1) }),
    run: (caller, input) => caller.wiki.pages.get({ id: (input as { id: string }).id }),
  },
  {
    name: "wiki_search",
    description:
      "Search wiki pages by title + content across the organization. Returns matching pages (id, title). Use to find a page when you don't know its id.",
    mutates: false,
    inputSchema: z.object({ query: z.string().min(2).max(200) }),
    run: (caller, input) => caller.wiki.pages.search({ query: (input as { query: string }).query }),
  },
  {
    name: "wiki_create_page",
    description:
      "Create a new wiki page. `parentId` null (or omitted) creates a top-level page; pass another page's id to nest it under that page. The page is created empty — set a clear title (and an optional emoji icon).",
    mutates: true,
    inputSchema: z.object({
      title: z.string().trim().min(1).max(200),
      parentId: z.string().min(1).nullable().optional(),
      icon: z.string().max(40).nullable().optional(),
    }),
    run: (caller, input) => {
      const p = input as { title: string; parentId?: string | null; icon?: string | null };
      return caller.wiki.pages.create({ title: p.title, parentId: p.parentId, icon: p.icon });
    },
  },
  {
    name: "wiki_update_page",
    description:
      "Update a wiki page's title and/or icon (emoji). Editing the page's rich body content isn't supported here — that's done in the editor.",
    mutates: true,
    inputSchema: z.object({
      id: z.string().min(1),
      title: z.string().trim().min(1).max(200).optional(),
      icon: z.string().max(40).nullable().optional(),
    }),
    run: (caller, input) => {
      const p = input as { id: string; title?: string; icon?: string | null };
      return caller.wiki.pages.update({ id: p.id, title: p.title, icon: p.icon });
    },
  },
  {
    name: "wiki_move_page",
    description:
      "Reparent and/or reorder a page. `newParentId` null moves it to the top level; pass a page id to nest it under that page. Optional `beforeId` places it just before that sibling (omit to append last). The server rejects moves that would create a cycle.",
    mutates: true,
    inputSchema: z.object({
      id: z.string().min(1),
      newParentId: z.string().min(1).nullable(),
      beforeId: z.string().min(1).nullable().optional(),
    }),
    run: (caller, input) => {
      const p = input as { id: string; newParentId: string | null; beforeId?: string | null };
      return caller.wiki.pages.move({
        id: p.id,
        newParentId: p.newParentId,
        beforeId: p.beforeId,
      });
    },
  },
  {
    name: "wiki_delete_page",
    description:
      "Delete a wiki page and all of its descendants (soft delete — recoverable). Returns the ids that were removed.",
    mutates: true,
    inputSchema: z.object({ id: z.string().min(1) }),
    run: (caller, input) => caller.wiki.pages.delete({ id: (input as { id: string }).id }),
  },
];
