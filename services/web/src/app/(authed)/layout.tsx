import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppBar } from "@/components/app-bar";
import type { BrandedAppLogoData } from "@/components/branded-app-logo-view";
import { ChatProvider } from "@/components/chat";
import { GlobalSearchProvider } from "@/components/global-search";
import { NavRail } from "@/components/nav-rail";
import { RecoveryCodeReminder } from "@/components/recovery-code-reminder";
import { TotpOnboardingPrompt } from "@/components/totp-onboarding-prompt";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rewriteForRequestHost } from "@/lib/request-host-rewrite";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { isCurrentDeviceTrusted } from "@/lib/trusted-device-cookie";

// Diagnostic logging gate. Set MONARK_AUTH_GATE_DEBUG=1 in CI to
// surface which (authed) gate path is firing on each redirect. The
// e2e suite started bouncing /account → /signin after the
// admin-interface refactor and we needed visibility into whether it
// was the session check or the trusted-device check pulling the
// trigger. Cheap enough to leave in ; production logs stay quiet
// unless an operator explicitly opts in.
const DEBUG_GATE = process.env.MONARK_AUTH_GATE_DEBUG === "1";
function debugRedirect(reason: string, extra?: Record<string, unknown>): void {
  if (!DEBUG_GATE) return;
  console.error(`[(authed)/layout] redirect: ${reason}`, extra ? JSON.stringify(extra) : "");
}

/**
 * Auth gate for every protected route in the app. Pages mounted under
 * `app/(authed)/...` (the parens make this a route group ; the URL
 * doesn't carry the segment) all run this server layout first ; if there
 * is no Supabase session, the request is short-circuited with a redirect
 * to `/signin` before any child layout / page renders. This means a
 * signed-out visitor never sees content from a protected page and
 * protected pages never make any backend fetches on behalf of an anon
 * user — both data exposure and wasted load avoided in one place.
 *
 * Beyond the session check, every request also has its trusted-device
 * cookie validated against the user's non-revoked TrustedDevice rows.
 * That's how the "revoke all sessions" emergency lockout actually
 * terminates other browsers ; once a device's row is stamped revoked,
 * any in-flight session on that device fails this check on its next
 * page navigation and gets booted to `/auth/sign-out-stale` (a route
 * handler that clears cookies, since server components can't mutate
 * cookies directly).
 *
 * Add a new protected page by dropping it under `(authed)/` ; that's it.
 * Per-page redirect-to-/signin checks are no longer needed.
 *
 * Nested layouts (e.g. `(authed)/admin/layout.tsx` for the rbac/totp
 * gate) compose on top of this one — Next runs them in folder order, so
 * the session check always runs first and rbac/role checks see a
 * guaranteed-present session.
 */
export default async function AuthedLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  // `getUser()` round-trips to the Supabase Auth server to validate the
  // JWT before returning the user record ; `getSession()` reads the
  // cookie directly and Supabase warns against trusting `.session.user`
  // for authorisation decisions because a tampered cookie could spoof
  // the id. We need both calls: `getUser` for the authenticated id,
  // `getSession` for the still-fresh access token to authorise the
  // downstream tRPC call. The two are batched in parallel since neither
  // depends on the other.
  const [userResult, sessionResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  if (userResult.error || !userResult.data.user) {
    debugRedirect("getUser failed → /signin", {
      hasError: !!userResult.error,
      errorMessage: userResult.error?.message,
    });
    redirect("/signin");
  }
  if (!sessionResult.data.session) {
    debugRedirect("no session → /signin");
    redirect("/signin");
  }

  const accessToken = sessionResult.data.session.access_token;

  // The trusted-device gate and the deletion-grace `users.me` read are
  // independent, so fire them together rather than serially. The device
  // check still redirects before `me` is ever used, so fetching `me`
  // up front only wastes work in the rare revoked-device case while
  // saving a full round trip on every normal navigation.
  const [trusted, me] = await Promise.all([
    isCurrentDeviceTrusted({
      accessToken,
      userId: userResult.data.user.id,
    }),
    createServerTrpcClient(accessToken)
      .users.me.query()
      .catch(() => null),
  ]);

  if (!trusted) {
    debugRedirect("trusted-device check failed → /auth/sign-out-stale", {
      userId: userResult.data.user.id,
    });
    redirect("/auth/sign-out-stale");
  }

  // Deletion-grace lockdown : when the user has requested account
  // deletion but the 14-day window hasn't elapsed yet, the only
  // surfaces they should see are the danger zone (to cancel) and the
  // (read-only) profile. Every other authed route bounces back to
  // /account/danger so they don't accidentally make changes that
  // are about to evaporate. The /account layout further filters its
  // tabs + the profile section locks itself read-only ; this layer
  // keeps users out of the routes the account layout can't gate
  // (admin, inbox, future module pages). Pathname comes from the
  // `x-pathname` request header that middleware sets on every request.
  if (me?.deletedAt) {
    const hdrs = await headers();
    const pathname = hdrs.get("x-pathname") ?? "";
    const onAccount = pathname === "/account" || pathname.startsWith("/account/");
    if (!onAccount) redirect("/account/danger");
  }

  // Brand mark for the persistent desktop NavRail. Public query (no auth
  // roundtrip), best-effort — falls through to the starter brand on failure.
  const brandStatus = await createServerTrpcClient()
    .organizations.bootstrapStatus.query()
    .catch(() => null);
  const brandedLogoData: BrandedAppLogoData = {
    // Host-rewritten for the same reason as the pre-auth brand mark :
    // this is server-rendered and handed to a client component as a
    // prop, so nothing corrects a loopback URL later. See
    // lib/request-host-rewrite.ts.
    singletonLogoUrl: await rewriteForRequestHost(brandStatus?.singletonLogoUrl ?? null),
    singletonDisplayName: brandStatus?.singletonDisplayName ?? null,
    isSingleTenantBootstrapped:
      brandStatus?.mode === "single" && Boolean(brandStatus?.bootstrapped),
  };

  return (
    // GlobalSearchProvider wraps the whole authed tree so the ⌘K palette
    // works on every route and the sidebar trigger can open it via context.
    <GlobalSearchProvider>
      {/* ChatProvider mounts the always-there AI companion once (like
          GlobalSearchProvider): it owns the open state + Cmd/Ctrl+J shortcut
          and renders the docked panel as its last child, so the conversation
          persists across route navigation. Gated by the `chat.enabled` flag. */}
      <ChatProvider>
        {/* App shell, mounted once here : the persistent primary-nav rail on
            md+ (left), and the AppBar + page body offset past the rail width.
            Below md the rail is hidden and the AppBar's hamburger drawer takes
            over. Full-height sections (calendar / kanban / data-at-xl) size
            themselves to `100dvh - 57px` (the bar's 56px row + 1px hairline ;
            `dvh` tracks the mobile URL-bar so bottom-anchored chrome stays in
            view) since the bar now sits above them rather than inside their
            shell. */}
        <NavRail brandedLogoData={brandedLogoData} />
        <div className="md:pl-14">
          <AppBar brandedLogoData={brandedLogoData} />
          {children}
        </div>
        {/* Global post-sign-in modal that nudges (or forces) the user to
            handle a recently-spent recovery code or a low remaining
            count. State lives server-side so closing the tab without
            handling it re-prompts on the next sign-in. */}
        <RecoveryCodeReminder />
        {/* One-time "turn on two-factor?" nudge for verified users who
            haven't enrolled. Mounted alongside the recovery reminder so
            both share the same server-owned-state approach ; gated by
            the `auth.totp-onboarding-prompt` flag server-side. */}
        <TotpOnboardingPrompt />
      </ChatProvider>
    </GlobalSearchProvider>
  );
}
