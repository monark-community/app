import "server-only";
import type { createServerTrpcClient } from "@/lib/trpc-server";

/**
 * Resolves a Data Model by its `key` from a route param, within the caller's
 * active org. Every Data Model is org-scoped, so a single lookup suffices.
 */
export async function resolveDataModelByKey(
  api: ReturnType<typeof createServerTrpcClient>,
  key: string,
) {
  return api.dataModels.models.getByKey.query({ key }).catch(() => null);
}
