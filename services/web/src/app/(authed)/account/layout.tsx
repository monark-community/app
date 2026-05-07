import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { AppBar } from "@/components/app-bar"
import { PageLayout } from "@/components/page-layout"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createServerTrpcClient } from "@/lib/trpc-server"
import { AccountSidebar } from "./account-sidebar"
import { AdminTotpBanner } from "./admin-totp-banner"

const GRACE_ALLOWED_PATHS: ReadonlySet<string> = new Set([
  "/account",
  "/account/profile",
  "/account/danger",
])

/**
 * Shared shell for every `/account/*` sub-route. Mounts the AppBar +
 * the account sidebar once so the four tab pages (profile / security /
 * notifications / danger) just export their section content.
 *
 * Two server-side gates layered on top of the parent (authed) layout :
 *
 *  1. Deletion-grace lockdown : when the user is in the 14-day window,
 *     every tab except `profile` (read-only) and `danger` (cancel-
 *     deletion) is blocked. The (authed) layout already keeps grace
 *     users out of non-`/account` routes ; this layer keeps them out
 *     of the blocked tabs *within* `/account` even if they type the
 *     URL directly. We read the live pathname from the `x-pathname`
 *     header that middleware sets on every request.
 *
 *  2. AdminTotpBanner mounts here so it follows the user across every
 *     tab (the banner self-disables when no enforcement is active).
 *     `?totpRequired=1` is preserved by the redirect from /admin and
 *     gets cleaned up client-side after first paint.
 */
export default async function AccountLayout({
  children,
}: {
  children: ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  // Session presence guaranteed by parent (authed) layout ; the !
  // carries that invariant into the type system.
  const accessToken = sessionData.session!.access_token
  const api = createServerTrpcClient(accessToken)
  const me = await api.users.me.query().catch(() => null)
  if (me?.deletedAt) {
    const hdrs = await headers()
    const pathname = hdrs.get("x-pathname") ?? ""
    if (!GRACE_ALLOWED_PATHS.has(pathname)) {
      redirect("/account/danger")
    }
  }

  return (
    <>
      <AppBar />
      {/*
        The page wrapper is full-width with edge padding ; PageLayout
        owns the centering (single column on mobile, 3-column grid on
        `xl+` so the content stays viewport-centered alongside the
        sidebar).
      */}
      <main className="w-full px-4 pb-20 pt-8 sm:px-6">
        <PageLayout sidebar={<AccountSidebar />}>
          <div className="border-b border-border pb-3 xl:hidden">
            <AccountSidebar orientation="horizontal" />
          </div>
          <AdminTotpBanner />
          {children}
        </PageLayout>
      </main>
    </>
  )
}
