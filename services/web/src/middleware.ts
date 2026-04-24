import { NextResponse, type NextRequest } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"

type CookieToSet = { name: string; value: string; options: CookieOptions }

// Refreshes the Supabase session cookies on every request so server components
// see a live session. See https://supabase.com/docs/guides/auth/server-side/nextjs.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    // Skip static assets and Next internals; match everything else.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)",
  ],
}
