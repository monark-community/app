import { cookies } from "next/headers"
import { createServerClient, type CookieOptions } from "@supabase/ssr"

type CookieToSet = { name: string; value: string; options: CookieOptions }

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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
