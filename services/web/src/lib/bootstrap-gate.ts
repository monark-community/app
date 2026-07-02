import { cache } from "react";
import { createServerTrpcClient } from "@/lib/trpc-server";

/**
 * Per-request memoized read of the bootstrap status from the api. Both
 * the root layout (for the org brand color) and the (anon)/(authed)
 * gate layouts (via {@link isSystemBootstrapped}) need this on the same
 * request ; `cache()` collapses those into a single api round trip per
 * request instead of one per call site. Returns `null` on any failure.
 */
export const getBootstrapStatus = cache(async () => {
  return createServerTrpcClient()
    .organizations.bootstrapStatus.query()
    .catch(() => null);
});

/**
 * Read the bootstrap status from the api service. Returns `true` when
 * the system is ready to serve requests (multi-tenant mode is always
 * ready ; single-tenant mode requires at least one organization). On
 * any failure we fall through to "ready" rather than locking everyone
 * out — the api being down is its own incident, no point compounding
 * it by hiding the regular auth surfaces too.
 *
 * Used by the (anon) and (authed) layouts to decide whether to redirect
 * to `/setup`. The /setup page calls the same status query directly so
 * its display matches whatever the gate just saw.
 */
export async function isSystemBootstrapped(): Promise<boolean> {
  const status = await getBootstrapStatus();
  if (!status) return true;
  return status.bootstrapped;
}
