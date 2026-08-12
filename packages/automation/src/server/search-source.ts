import { registerSearchSource } from "@monark/common";
import { requireOrg } from "@monark/organizations/server";
import { requirePermission } from "@monark/rbac/server";
import { searchAutomations } from "./data";

/**
 * Contribute automations (flows) to the global command palette, by name. Scoped
 * to `automation.view` like `automation.search` — so non-admins get no results.
 */
export function registerAutomationSearchSource(): void {
  registerSearchSource({
    module: "automation",
    groupId: "automation",
    label: "Automations",
    run: async (ctx, query, limit) => {
      if (!ctx.userId) return [];
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "automation.view", org.id);
      const rows = await searchAutomations({ organizationId: org.id, query, limit });
      return rows.map((automation) => ({
        id: automation.id,
        title: automation.name,
        href: `/automation/${automation.id}`,
      }));
    },
  });
}
