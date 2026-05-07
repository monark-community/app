import { createServerTrpcClient } from "@/lib/trpc-server"

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
  const api = createServerTrpcClient()
  const status = await api.organizations.bootstrapStatus
    .query()
    .catch(() => null)
  if (!status) return true
  return status.bootstrapped
}
