import { NextResponse, type NextRequest } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"

type CookieToSet = { name: string; value: string; options: CookieOptions }

// Routes that must stay reachable even while a TOTP challenge is pending,
// so the user can finish the gate or escape via sign-out.
const TOTP_BYPASS_PREFIXES = ["/signin", "/signup", "/auth/"]
const TOTP_PENDING_COOKIE = "monark_totp_pending"

// Refreshes the Supabase session cookies on every request so server
// components see a live session, and redirects any in-flight request to
// `/signin/totp` while a TOTP challenge is pending. See
// https://supabase.com/docs/guides/auth/server-side/nextjs.
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

  const totpPending = request.cookies.get(TOTP_PENDING_COOKIE)?.value
  if (totpPending) {
    const path = request.nextUrl.pathname
    const bypass = TOTP_BYPASS_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix),
    )
    if (!bypass) {
      const redirectUrl = new URL("/signin/totp", request.url)
      return NextResponse.redirect(redirectUrl)
    }
  }

  return response
}

export const config = {
  matcher: [
    // Skip static assets and Next internals; match everything else.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)",
  ],
}
