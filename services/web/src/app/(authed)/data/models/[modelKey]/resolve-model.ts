import "server-only";
import type { createServerTrpcClient } from "@/lib/trpc-server";

/**
 * Resolves a Data Model by its `key` from a route param. The URL alone
 * doesn't say whether the model is org-scoped or platform-wide (both share
 * one `key` namespace conceptually, but are two separate partial-unique
 * indexes server-side — see `dataModels.models.getByKey`'s `platform`
 * flag) ; try the caller's own org first, then fall back to the
 * platform-wide namespace.
 */
export async function resolveDataModelByKey(
  api: ReturnType<typeof createServerTrpcClient>,
  key: string,
) {
  const orgScoped = await api.dataModels.models.getByKey
    .query({ key, platform: false })
    .catch(() => null);
  if (orgScoped) return orgScoped;
  return api.dataModels.models.getByKey.query({ key, platform: true }).catch(() => null);
}
