import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import { emit, NotFoundError, UnauthorizedError, type DocumentBlock } from "@monark/common";
import { requireOrg } from "@monark/organizations/server";
import { requirePermission } from "@monark/rbac/server";
import { WIKI_ICON_MAX, WIKI_TITLE_MAX } from "../contracts";
import type {
  WikiPageChange,
  WikiPageCreatedEvent,
  WikiPageDeletedEvent,
  WikiPageMovedEvent,
  WikiPageUpdatedEvent,
} from "../contracts";
import {
  createPage,
  duplicatePage,
  findPageById,
  getAncestors,
  listPagesForOrg,
  movePage,
  restoreSubtree,
  searchPages,
  softDeleteSubtree,
  updatePage,
  type WikiPageRow,
} from "./data";

/** Load a page in the caller's org, or throw NotFound (also hides cross-org ids). */
async function requireOwnedPage(
  id: string,
  organizationId: string,
  opts?: { includeDeleted?: boolean },
): Promise<WikiPageRow> {
  const page = await findPageById(id, opts);
  if (!page || page.organizationId !== organizationId) throw new NotFoundError("WikiPage", id);
  return page;
}

export const wikiRouter = router({
  pages: router({
    // The sidebar's single load : every page's light shape for the org tree.
    tree: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "wiki.read", org.id);
      return listPagesForOrg(org.id);
    }),

    // Full page + its root-first ancestor chain (breadcrumb).
    get: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "wiki.read", org.id);
        const page = await requireOwnedPage(input.id, org.id);
        const ancestors = await getAncestors(org.id, page.id);
        return { page, ancestors };
      }),

    create: publicProcedure
      .input(
        z.object({
          parentId: z.string().min(1).nullable().optional(),
          title: z.string().trim().min(1).max(WIKI_TITLE_MAX),
          icon: z.string().max(WIKI_ICON_MAX).nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const actorId = await requirePermission(ctx, "wiki.create", org.id);
        const parentId = input.parentId ?? null;
        if (parentId) await requireOwnedPage(parentId, org.id);
        const page = await createPage({
          organizationId: org.id,
          parentId,
          title: input.title,
          icon: input.icon ?? null,
          createdBy: actorId,
        });
        const event: WikiPageCreatedEvent = {
          type: "wiki.page-created",
          pageId: page.id,
          organizationId: org.id,
          parentId,
          title: page.title,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event);
        return page;
      }),

    // The editor's autosave calls this (title / icon / content patch).
    update: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          title: z.string().trim().min(1).max(WIKI_TITLE_MAX).optional(),
          icon: z.string().max(WIKI_ICON_MAX).nullable().optional(),
          // A BlockNote block array (opaque JSON) ; the editor is the schema.
          content: z.array(z.unknown()).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const actorId = await requirePermission(ctx, "wiki.update", org.id);
        const existing = await requireOwnedPage(input.id, org.id);
        const changed: WikiPageChange[] = [];
        if (input.title !== undefined && input.title !== existing.title) changed.push("title");
        if (input.icon !== undefined && (input.icon ?? null) !== existing.icon)
          changed.push("icon");
        // Block content compares by serialized value (any block change counts).
        if (
          input.content !== undefined &&
          JSON.stringify(input.content) !== JSON.stringify(existing.content)
        ) {
          changed.push("content");
        }
        const page = await updatePage(input.id, {
          title: input.title,
          icon: input.icon,
          content: input.content as DocumentBlock[] | undefined,
          updatedBy: actorId,
        });
        if (changed.length > 0) {
          const event: WikiPageUpdatedEvent = {
            type: "wiki.page-updated",
            pageId: page.id,
            organizationId: org.id,
            changed,
            actorId,
            occurredAt: new Date(),
          };
          await emit(event);
        }
        return page;
      }),

    // Reparent + reorder. The server guards against cycles (see data.movePage).
    move: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          newParentId: z.string().min(1).nullable(),
          beforeId: z.string().min(1).nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const actorId = await requirePermission(ctx, "wiki.update", org.id);
        const existing = await requireOwnedPage(input.id, org.id);
        if (input.newParentId) await requireOwnedPage(input.newParentId, org.id);
        await movePage({
          organizationId: org.id,
          pageId: input.id,
          newParentId: input.newParentId,
          beforeId: input.beforeId ?? null,
        });
        const event: WikiPageMovedEvent = {
          type: "wiki.page-moved",
          pageId: input.id,
          organizationId: org.id,
          fromParentId: existing.parentId,
          toParentId: input.newParentId,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const actorId = await requirePermission(ctx, "wiki.delete", org.id);
        await requireOwnedPage(input.id, org.id);
        const pageIds = await softDeleteSubtree(org.id, input.id);
        const event: WikiPageDeletedEvent = {
          type: "wiki.page-deleted",
          pageId: input.id,
          organizationId: org.id,
          pageIds,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event);
        return { pageIds };
      }),

    restore: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "wiki.delete", org.id);
        await requireOwnedPage(input.id, org.id, { includeDeleted: true });
        const pageIds = await restoreSubtree(org.id, input.id);
        return { pageIds };
      }),

    duplicate: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const actorId = await requirePermission(ctx, "wiki.create", org.id);
        const source = await requireOwnedPage(input.id, org.id);
        const page = await duplicatePage(source, actorId);
        const event: WikiPageCreatedEvent = {
          type: "wiki.page-created",
          pageId: page.id,
          organizationId: org.id,
          parentId: page.parentId,
          title: page.title,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event);
        return page;
      }),

    // Title + content search across the org — powers the global command palette.
    search: publicProcedure
      .input(z.object({ query: z.string().min(2).max(200) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "wiki.read", org.id);
        return searchPages(org.id, input.query);
      }),
  }),
});

export { registerWikiPermissions } from "./permissions";
export { registerWikiEventTypes } from "./event-types";
export { registerWikiFeatureFlags } from "./flags";
export { registerWikiAutomationNodes } from "./nodes";
export { registerWikiSearchSource } from "./search-source";
export type { WikiPageRow } from "./data";
