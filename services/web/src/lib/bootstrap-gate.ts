import { cache } from "react";
import { createServerTrpcClient } from "@/lib/trpc-server";

/**
 * Per-request memoized read of the bootstrap status from the api. Several
 * server components need it on the same request — the root layout for the
 * singleton org's brand color, the admin surfaces to resolve the single-tenant
 * org — so `cache()` collapses them into a single api round trip per request.
 * Returns `null` on any failure ; callers treat "unknown" as non-blocking.
 */
export const getBootstrapStatus = cache(async () => {
  return createServerTrpcClient()
    .organizations.bootstrapStatus.query()
    .catch(() => null);
});
