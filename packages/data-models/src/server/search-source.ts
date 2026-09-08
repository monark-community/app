import { registerSearchSource } from "@monark/common";
import { requireOrg } from "@monark/organizations/server";
import { getUserRoles, hasPermission } from "@monark/rbac/server";
import { listDataModels, searchRecordsAcrossModels } from "./data";
import { perModelPermissionDotted } from "./registrations";

// How many models to consider for a global search (a high safety cap ; orgs with
// more models than this would miss the tail — a follow-up if it ever bites).
const MODELS_SCAN_CAP = 200;

/**
 * Contribute Data Model records to the global command palette — the cross-model
 * record search that didn't exist before. Access is enforced in two layers,
 * mirroring the records list : model-level `record-read` (blanket OR per-model,
 * with `view-all-records` bypass) narrows which models are searched, then row-level
 * role access (`searchRecordsAcrossModels`) filters the matched records.
 */
export function registerDataModelsSearchSource(): void {
  registerSearchSource({
    module: "data-models",
    groupId: "data",
    label: "Records",
    run: async (ctx, query, limit) => {
      if (!ctx.userId) return [];
      const userId = ctx.userId;
      const org = await requireOrg({ userId, activeOrganizationId: ctx.activeOrganizationId });

      const [modelsPage, roles, bypass, blanketRead] = await Promise.all([
        listDataModels({ organizationId: org.id, limit: MODELS_SCAN_CAP }),
        getUserRoles(userId, org.id),
        hasPermission(userId, "data-models.view-all-records", org.id),
        hasPermission(userId, "data-models.record-read", org.id),
      ]);
      const models = modelsPage.items;

      // Models the caller may read records of : everything on a blanket grant /
      // data-admin bypass, else only those with a per-model record-read grant.
      let readable = models;
      if (!blanketRead && !bypass) {
        const flags = await Promise.all(
          models.map((m) => hasPermission(userId, perModelPermissionDotted(m.key, "read"), org.id)),
        );
        readable = models.filter((_, i) => flags[i]);
      }
      if (readable.length === 0) return [];

      const hits = await searchRecordsAcrossModels({
        organizationId: org.id,
        readableModelIds: readable.map((m) => m.id),
        roleIds: roles.map((r) => r.id),
        bypassRoleAccess: bypass,
        query,
        limit,
      });
      return hits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        subtitle: hit.modelName,
        href: `/data/models/${hit.modelKey}?record=${hit.id}`,
      }));
    },
  });
}
