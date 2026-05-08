import { NextResponse, type NextRequest } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { getRequestOrigin } from "@/lib/request-origin"
import { SUPABASE_AUTH_STORAGE_KEY } from "@/lib/supabase/storage-key"

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
  // Pass the resolved pathname through to server components via a
  // request header. Next 15 doesn't expose `pathname` to layouts /
  // server components otherwise ; the (authed) and /account layouts
  // both read this to make routing decisions (e.g. redirecting
  // deletion-pending users to /account/danger when they navigate
  // elsewhere).
  request.headers.set("x-pathname", request.nextUrl.pathname)
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // Pinned key matches the server-action + browser clients ; without
      // this the middleware reads/writes a different cookie name than
      // those clients, the session goes invisible across tab refreshes.
      auth: { storageKey: SUPABASE_AUTH_STORAGE_KEY },
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

  // Note : `Accept-CH`, `Critical-CH`, `Permissions-Policy`, plus the
  // CSP / HSTS / X-Frame-Options / X-Content-Type-Options /
  // Referrer-Policy headers all live in [next.config.ts](../next.config.ts)'s
  // `headers()` config. That puts them on the edge cache so Vercel
  // can serve them without booting middleware on every request, and
  // keeps middleware focused on auth state — supabase session
  // refresh + the TOTP-pending redirect.

  const totpPending = request.cookies.get(TOTP_PENDING_COOKIE)?.value
  if (totpPending) {
    const path = request.nextUrl.pathname
    const bypass = TOTP_BYPASS_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix),
    )
    if (!bypass) {
      // Build from the Host header rather than `request.url` so a
      // user mid-TOTP-pending on a LAN device gets redirected to
      // their host, not loopback. Same reasoning as /auth/confirm.
      const redirectUrl = new URL("/signin/totp", getRequestOrigin(request))
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
