import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isSystemBootstrapped } from "@/lib/bootstrap-gate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TOTP_PENDING_COOKIE } from "@/lib/totp-pending-cookie";

/**
 * Inverse of `(authed)/layout.tsx`: pages under `(anon)/...` are sign-in /
 * sign-up surfaces that an already-authenticated user has no business
 * seeing. If a session exists, redirect to `/`.
 *
 * Exception: the TOTP-pending mid-flow (`/signin/totp`). After
 * `signInWithPassword` resolves, the Supabase session cookie is already
 * live ; the `monark_totp_pending` cookie is what actually gates access
 * to authed routes (the middleware redirects every non-bypass path
 * back to `/signin/totp` while it's set). If we bounced on session
 * presence here, the user would loop forever between this layout
 * (session → redirect /) and the middleware (totp-pending → redirect
 * /signin/totp). So when both cookies are present, treat the user as
 * mid-flow and let the page render.
 */
export default async function AnonLayout({ children }: { children: ReactNode }) {
  // Bootstrap gate runs *before* the session check : when the system
  // isn't yet ready (single-tenant deploy without an initial org), even
  // sign-in / sign-up surfaces would be misleading — there's no app to
  // sign into yet — so everyone gets bounced to /setup.
  if (!(await isSystemBootstrapped())) redirect("/setup");

  const supabase = await createSupabaseServerClient();
  // `getUser()` round-trips to Supabase Auth and validates the JWT
  // against the auth server's signing key ; `getSession()` only parses
  // the local cookie. The (authed) layout uses `getUser()` (per Supabase's
  // own guidance — `.session.user` is untrusted), so if we used the
  // cheaper `getSession()` here, a stale / cross-project cookie that
  // *parses* but doesn't *validate* would have us redirect to `/` while
  // (authed) bounces back to `/signin`, looping forever. Pay the
  // round-trip here so both layouts agree on the answer.
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (!userErr && userData.user) {
    const cookieStore = await cookies();
    const totpPending = cookieStore.get(TOTP_PENDING_COOKIE)?.value;
    if (!totpPending) redirect("/");
  }
  return <>{children}</>;
}
