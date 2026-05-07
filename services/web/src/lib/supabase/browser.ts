import { createBrowserClient } from "@supabase/ssr"
import { rewriteForCurrentHost } from "../dev-host-rewrite"
import { SUPABASE_AUTH_STORAGE_KEY } from "./storage-key"

export function createSupabaseBrowserClient() {
  // Same loopback-rewrite trick as the tRPC client : when the dev
  // env var points at `127.0.0.1:54321` but the browser is loaded
  // from a LAN host (phone testing), swap the hostname so the
  // browser hits the developer's machine instead of its own
  // loopback. No-op in production where SUPABASE_URL points at the
  // real Supabase project.
  const supabaseUrl = rewriteForCurrentHost(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
  )
  return createBrowserClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // Pin the storage key so server + browser clients agree on
      // where the session lives, regardless of which URL each one
      // happens to be configured with. By default supabase-js derives
      // the key from the project URL ; the dev-host rewrite changes
      // the URL on the browser but NOT on the server, which would
      // desync the keys (server writes `sb-127.0.0.1-auth-token`,
      // browser reads `sb-10.0.0.208-auth-token`, finds nothing,
      // tRPC fires anonymous, every authed query returns empty).
      // Same constant on both sides keeps everyone honest.
      auth: { storageKey: SUPABASE_AUTH_STORAGE_KEY },
    },
  )
}
