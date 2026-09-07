import { NextResponse, type NextRequest } from "next/server";
import { pickLocaleFromHeader } from "@monark/auth/contracts";
import { completeSignIn } from "@/lib/complete-sign-in";
import { getRequestOrigin } from "@/lib/request-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";

// Where the provider sends the browser back after "continue with
// Google / Microsoft / GitHub". The buttons kick the flow off from the
// browser (`supabase.auth.signInWithOAuth`), which leaves the PKCE code
// verifier in a cookie ; this handler is the server half that trades
// the authorization code for a session.
//
// Distinct from /auth/confirm, which handles emailed OTP links. The two
// arrive with different query shapes and different failure modes, and
// only this one has to create the shadow `User` row from scratch.
export async function GET(request: NextRequest) {
  // Read the origin from the Host header rather than `request.url` so
  // redirects keep the user on the host they came in on ; see
  // `getRequestOrigin` for why `request.url` lies behind proxies.
  const url = new URL(request.url);
  const origin = getRequestOrigin(request);
  // The URL carries a single-use authorization code ; keep it out of
  // the Referer header on the way to the next page.
  const noReferrer = { "Referrer-Policy": "no-referrer" };

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/signin?oauthError=${encodeURIComponent(reason)}`, origin), {
      headers: noReferrer,
    });

  // The user declined consent at the provider, or the provider itself
  // errored. Supabase forwards both as query params.
  const providerError = url.searchParams.get("error");
  if (providerError) {
    return fail(providerError === "access_denied" ? "cancelled" : "exchange-failed");
  }

  const code = url.searchParams.get("code");
  if (!code) return fail("exchange-failed");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session || !data.user) {
    return fail("exchange-failed");
  }

  const accessToken = data.session.access_token;
  const api = createServerTrpcClient(accessToken);

  // Create (or backfill) the shadow `User` row before anything else
  // touches the session. Supabase made the auth user while the browser
  // was away at the provider, so on a first social sign-in this is the
  // moment our own database first hears about the account ; every
  // downstream read assumes the row exists.
  //
  // Not best-effort, unlike most of the calls in this flow : a session
  // whose shadow row is missing is a broken account, not a degraded
  // one. On any failure we drop the session cookie again so the user
  // retries cleanly instead of landing in a half-provisioned state.
  const localePreference = pickLocaleFromHeader(request.headers.get("accept-language"));
  const provisioned = await api.auth.oauth.provision.mutate({ localePreference }).catch(() => null);

  if (!provisioned || !provisioned.ok) {
    await supabase.auth.signOut({ scope: "local" });
    return fail(provisioned ? provisioned.reason : "provision-failed");
  }

  return NextResponse.redirect(new URL(await completeSignIn(accessToken), origin), {
    headers: noReferrer,
  });
}
