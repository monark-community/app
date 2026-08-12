import { registerSearchSource } from "@monark/common";
import { requireOrg } from "@monark/organizations/server";
import { requirePermission } from "@monark/rbac/server";
import { searchPages } from "./data";

/**
 * Contribute wiki pages to the global command palette. Registered once at api
 * boot ; scopes itself exactly like `wiki.pages.search` (org + `wiki.read`).
 */
export function registerWikiSearchSource(): void {
  registerSearchSource({
    module: "wiki",
    groupId: "wiki",
    label: "Wiki pages",
    run: async (ctx, query, limit) => {
      if (!ctx.userId) return [];
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "wiki.read", org.id);
      const pages = await searchPages(org.id, query);
      return pages.slice(0, limit).map((page) => ({
        id: page.id,
        title: page.title,
        icon: page.icon ?? undefined,
        href: `/wiki/${page.id}`,
      }));
    },
  });
}
