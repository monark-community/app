import { NextResponse, type NextRequest } from "next/server";
import { completeSignIn } from "@/lib/complete-sign-in";
import { getRequestOrigin } from "@/lib/request-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";

// Two possible arrival shapes:
//   1. `?token_hash=...&type=...` ; direct link from a custom email template.
//   2. No token_hash ; Supabase's default template sent the user through
//      `/auth/v1/verify` first, which already set the session cookie and 302'd here.
export async function GET(request: NextRequest) {
  // `url` is parsed from the request line and is OK for reading query
  // params, but its `origin` reflects whatever Node sees (loopback in
  // proxied / LAN-portproxy setups) — never use it for redirects.
  // `origin` below is read from the Host header so 30x responses keep
  // the user on the host they originally hit.
  const url = new URL(request.url);
  const origin = getRequestOrigin(request);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") ?? "email";
  const errorCode = url.searchParams.get("error_code") ?? url.searchParams.get("error");

  const noReferrer = { "Referrer-Policy": "no-referrer" };

  if (errorCode) {
    return NextResponse.redirect(
      new URL(`/auth/confirm-error?reason=${encodeURIComponent(errorCode)}`, origin),
      { headers: noReferrer },
    );
  }

  const supabase = await createSupabaseServerClient();

  if (tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({
      type: type as "signup" | "email" | "recovery" | "invite" | "email_change",
      token_hash: tokenHash,
    });
    if (error || !data.user || !data.session) {
      return NextResponse.redirect(
        new URL(
          `/auth/confirm-error?reason=${encodeURIComponent(error?.code ?? "invalid")}`,
          origin,
        ),
        { headers: noReferrer },
      );
    }
    const accessToken = data.session.access_token;
    const api = createServerTrpcClient(accessToken);

    // Email-change confirmation: Supabase just rotated auth.users.email;
    // mirror the new value into our shadow row and force sign-out so the
    // user re-authenticates with the new address.
    if (type === "email_change") {
      const newEmail = data.user.email;
      if (newEmail) {
        await api.users.syncEmail.mutate({ email: newEmail }).catch(() => {});
      }
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.redirect(new URL("/signin?emailChanged=1", origin), {
        headers: noReferrer,
      });
    }

    // Password recovery: Supabase has issued a temporary session keyed
    // to the recovery token. Land the user on `/auth/reset-password` so
    // they can set a new password without going through the full
    // current-password gate (they don't know the current one). The
    // reset page lives outside the (authed) route group so the trusted-
    // device check doesn't bounce a recovery-flow session that has no
    // device cookie yet.
    if (type === "recovery") {
      return NextResponse.redirect(new URL("/auth/reset-password", origin), {
        headers: noReferrer,
      });
    }

    await api.auth.markOwnEmailVerified.mutate().catch(() => {
      // Best-effort shadow-table update. Runs before `completeSignIn`
      // so the page the user lands on already sees a verified account.
    });
    // Everything after verification is the shared post-auth sequence —
    // device recognition, the TOTP challenge, `user.signed-in`, pending
    // invites, the deletion-grace bounce. This route used to run its own
    // shorter tail, which meant confirming an email established a
    // session without ever challenging an enrolled authenticator.
    return NextResponse.redirect(new URL(await completeSignIn(accessToken), origin), {
      headers: noReferrer,
    });
  }

  // No token in the URL; Supabase already verified server-side and set the
  // session cookie. Trust the cookie-backed session + mirror the state.
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const user = sessionData.session?.user ?? null;
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !user || !accessToken) {
    return NextResponse.redirect(new URL("/auth/confirm-error?reason=missing", origin), {
      headers: noReferrer,
    });
  }

  // Recovery via Supabase's default verify→redirect path : token is gone
  // by the time we arrive here, but the redirect_to query string still
  // carries `type=recovery`. Mirror the token-hash branch and forward to
  // the password-reset page.
  if (type === "recovery") {
    return NextResponse.redirect(new URL("/auth/reset-password", origin), { headers: noReferrer });
  }

  if (!user.email_confirmed_at) {
    return NextResponse.redirect(new URL("/auth/confirm-error?reason=missing", origin), {
      headers: noReferrer,
    });
  }

  const api = createServerTrpcClient(accessToken);
  await api.auth.markOwnEmailVerified.mutate().catch(() => {});
  // Same shared tail as the token-hash branch above.
  return NextResponse.redirect(new URL(await completeSignIn(accessToken), origin), {
    headers: noReferrer,
  });
}
