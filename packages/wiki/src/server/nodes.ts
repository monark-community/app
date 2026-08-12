import { z } from "zod";
import {
  defineNode,
  registerAutomationNodes,
  type NodeExecutionContext,
} from "@monark/automation/server";
import { hasPermission } from "@monark/rbac/server";
import { textToBlocks } from "@monark/common/blocks";
import { WIKI_ICON_MAX, WIKI_TITLE_MAX } from "../contracts";
import { createPage, findPageById, softDeleteSubtree, updatePage } from "./data";

// Wiki **action** nodes for automations — the write half of the integration
// (the read/trigger half is free : wiki emits domain events that automations
// subscribe to). Mirrors the built-in Data Record nodes' shape exactly : resolve
// the automation owner, gate on the owner's own wiki permission (so a node can't
// do what its owner couldn't through the UI), call the wiki data layer directly.
// Like the other action nodes these do NOT emit wiki domain events — that keeps a
// flow from re-triggering itself, matching the Data Record nodes.

const WIKI_CATEGORY = "wiki";
const WIKI_ICON = "BookText";

/** Resolve the owner the run acts as, and require they hold `permission`. */
async function requireOwnerPermission(
  ctx: NodeExecutionContext,
  permission: string,
): Promise<string> {
  const ownerId = ctx.actorUserId;
  if (!ownerId) throw new Error("This automation has no owner to act as.");
  if (!(await hasPermission(ownerId, permission, ctx.organizationId))) {
    throw new Error(`The automation owner lacks the "${permission}" permission.`);
  }
  return ownerId;
}

/** Load a page in the run's org, or throw (also hides cross-org ids). */
async function requireOwnedPage(ctx: NodeExecutionContext, id: string) {
  const page = await findPageById(id);
  if (!page || page.organizationId !== ctx.organizationId) {
    throw new Error(`Wiki page "${id}" not found in this org.`);
  }
  return page;
}

/** Create a wiki page (optionally nested, optionally with a plain-text body). */
export const wikiCreatePageNode = defineNode({
  descriptor: {
    kind: "action",
    category: WIKI_CATEGORY,
    label: "Wiki: Create page",
    description: "Create a wiki page, optionally under a parent and with a body.",
    icon: WIKI_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "pageId", type: "string", description: "The id of the created page." },
      { key: "title", type: "string", description: "The created page's title." },
    ],
    configFields: [
      { key: "title", label: "Title", type: "text", required: true },
      {
        key: "parentId",
        label: "Parent page id",
        type: "text",
        help: "Nest under this page. Leave blank for a top-level page.",
      },
      { key: "icon", label: "Icon (emoji)", type: "text" },
      {
        key: "body",
        label: "Body",
        type: "textarea",
        help: "Plain text ; each line becomes a paragraph. Leave blank for an empty page.",
      },
    ],
  },
  configSchema: z.object({
    title: z.string().trim().min(1).max(WIKI_TITLE_MAX),
    parentId: z.string().optional(),
    icon: z.string().max(WIKI_ICON_MAX).optional(),
    body: z.string().optional(),
  }),
  execute: async (ctx, config) => {
    const actorId = await requireOwnerPermission(ctx, "wiki.create");
    const parentId = config.parentId?.trim() ? config.parentId.trim() : null;
    if (parentId) await requireOwnedPage(ctx, parentId);
    const page = await createPage({
      organizationId: ctx.organizationId,
      parentId,
      title: config.title,
      icon: config.icon?.trim() ? config.icon.trim() : null,
      createdBy: actorId,
    });
    if (config.body && config.body.length > 0) {
      await updatePage(page.id, { content: textToBlocks(config.body), updatedBy: actorId });
    }
    ctx.log(`Created wiki page "${page.title}" (${page.id}).`);
    return { pageId: page.id, title: page.title };
  },
});

/** Update a wiki page's title / icon / body. */
export const wikiUpdatePageNode = defineNode({
  descriptor: {
    kind: "action",
    category: WIKI_CATEGORY,
    label: "Wiki: Update page",
    description: "Update a wiki page's title, icon, or body.",
    icon: WIKI_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [{ key: "pageId", type: "string", description: "The updated page's id." }],
    configFields: [
      { key: "pageId", label: "Page id", type: "text", required: true },
      { key: "title", label: "New title", type: "text" },
      { key: "icon", label: "New icon (emoji)", type: "text" },
      {
        key: "body",
        label: "New body",
        type: "textarea",
        help: "Replaces the page body ; each line becomes a paragraph.",
      },
    ],
  },
  configSchema: z.object({
    pageId: z.string().min(1),
    title: z.string().trim().min(1).max(WIKI_TITLE_MAX).optional(),
    icon: z.string().max(WIKI_ICON_MAX).optional(),
    body: z.string().optional(),
  }),
  execute: async (ctx, config) => {
    const actorId = await requireOwnerPermission(ctx, "wiki.update");
    const page = await requireOwnedPage(ctx, config.pageId);
    await updatePage(page.id, {
      ...(config.title !== undefined ? { title: config.title } : {}),
      ...(config.icon !== undefined
        ? { icon: config.icon.trim() ? config.icon.trim() : null }
        : {}),
      ...(config.body !== undefined ? { content: textToBlocks(config.body) } : {}),
      updatedBy: actorId,
    });
    ctx.log(`Updated wiki page "${page.title}" (${page.id}).`);
    return { pageId: page.id };
  },
});

/** Delete a wiki page and its whole subtree (soft delete). */
export const wikiDeletePageNode = defineNode({
  descriptor: {
    kind: "action",
    category: WIKI_CATEGORY,
    label: "Wiki: Delete page",
    description: "Soft-delete a wiki page and all of its sub-pages.",
    icon: WIKI_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "pageId", type: "string", description: "The deleted page's id." },
      { key: "deletedCount", type: "number", description: "Pages removed (root + descendants)." },
    ],
    configFields: [{ key: "pageId", label: "Page id", type: "text", required: true }],
  },
  configSchema: z.object({ pageId: z.string().min(1) }),
  execute: async (ctx, config) => {
    await requireOwnerPermission(ctx, "wiki.delete");
    const page = await requireOwnedPage(ctx, config.pageId);
    const ids = await softDeleteSubtree(ctx.organizationId, page.id);
    ctx.log(`Deleted wiki page ${page.id} and ${ids.length - 1} sub-page(s).`);
    return { pageId: page.id, deletedCount: ids.length };
  },
});

let registered = false;

/**
 * Register the Wiki action nodes under the `wiki` namespace. Called once at api
 * boot (idempotent), like the Telegram / Discord integrations.
 */
export function registerWikiAutomationNodes(): void {
  if (registered) return;
  registered = true;
  registerAutomationNodes("wiki", {
    "create-page": wikiCreatePageNode,
    "update-page": wikiUpdatePageNode,
    "delete-page": wikiDeletePageNode,
  });
}
