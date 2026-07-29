import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PageLayout } from "@/components/page-layout";
import { SecondaryTabsBar } from "@/components/secondary-tabs-bar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { AccountSidebar } from "./account-sidebar";
import { AdminTotpBanner } from "./admin-totp-banner";

const GRACE_ALLOWED_PATHS: ReadonlySet<string> = new Set([
  "/account",
  "/account/profile",
  "/account/danger",
]);

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
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  // Next.js renders nested layouts concurrently as async server
  // components ; the parent (authed) layout's session-gate redirect
  // throws on the same microtask we run on. If we eagerly
  // dereference `session.access_token` while that redirect is still
  // in flight, the child throws a TypeError that surfaces in server
  // logs even though the response ultimately becomes the parent's
  // 307. Bail out cleanly when no session is present and let the
  // parent's redirect land.
  if (!sessionData.session) return null;
  const accessToken = sessionData.session.access_token;
  const api = createServerTrpcClient(accessToken);
  const me = await api.users.me.query().catch(() => null);
  if (me?.deletedAt) {
    const hdrs = await headers();
    const pathname = hdrs.get("x-pathname") ?? "";
    if (!GRACE_ALLOWED_PATHS.has(pathname)) {
      redirect("/account/danger");
    }
  }

  return (
    <>
      {/* Mobile / narrow-viewport secondary nav — the shared sticky
          scroll-hiding strip, same as Admin / Data (was a non-sticky
          strip inside the content column). Hidden on `xl+` where the
          PageLayout vertical rail takes over. */}
      <SecondaryTabsBar>
        <AccountSidebar orientation="horizontal" />
      </SecondaryTabsBar>
      {/*
        The page wrapper is full-width with edge padding ; PageLayout
        owns the centering (single column on mobile, 3-column grid on
        `xl+` so the content stays viewport-centered alongside the
        sidebar).
      */}
      <main className="w-full px-4 pb-20 pt-8 sm:px-6">
        <PageLayout sidebar={<AccountSidebar />}>
          <AdminTotpBanner />
          {children}
        </PageLayout>
      </main>
    </>
  );
}
