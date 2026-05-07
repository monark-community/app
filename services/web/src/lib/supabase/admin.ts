import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let cached: SupabaseClient | undefined

/**
 * Server-only Supabase client that talks to Supabase with the service-
 * role secret key — bypasses every RLS policy on `storage.objects` and
 * the public schema. Use only from server actions that have already
 * gated the caller via rbac (e.g. admin-only org logo uploads write
 * under paths that don't fit the per-user RLS template).
 *
 * Lazy-instantiated so a missing env doesn't crash imports ; throws
 * with a clear message the first time a caller actually needs it.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    throw new Error(
      "Supabase admin client requires SUPABASE_URL + SUPABASE_SECRET_KEY in the web environment.",
    )
  }
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cached
}
