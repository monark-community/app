import { cookies } from "next/headers"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { SUPABASE_AUTH_STORAGE_KEY } from "./storage-key"

type CookieToSet = { name: string; value: string; options: CookieOptions }

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // Pin the storage key so the browser-side Supabase client (which
      // may have rewritten the URL for LAN access) reads sessions
      // under the same name we wrote them. See
      // `lib/supabase/storage-key.ts` for the threat-model rationale.
      auth: { storageKey: SUPABASE_AUTH_STORAGE_KEY },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // `set` can throw in a Server Component; that's fine when we're only
            // reading the session. The middleware refreshes cookies on every
            // request, so writes here are best-effort.
          }
        },
      },
    },
  )
}
