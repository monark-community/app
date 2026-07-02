"use server";

import { redirect } from "next/navigation";
import { getRequestAppUrl } from "@/lib/request-app-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Always returns ok regardless of whether the email matches a real
// account. Revealing "no account with that email" turns the form into
// an enumeration oracle for attackers ; the UX cost (legitimate users
// who mistyped get a "we sent a link" message that never arrives) is
// small relative to leaking account presence. Supabase's underlying
// `resetPasswordForEmail` already silently no-ops for unknown emails ;
// we just don't surface that distinction.
//
// `redirectTo` lands the user on `/auth/confirm?type=recovery`, which
// the existing confirm route handler already verifies the token through
// and forwards to `/auth/reset-password` ; that page (outside the
// (authed) gate so the recovery-flow session isn't bounced by the
// trusted-device check) collects the new password.
export async function requestPasswordResetAction(input: { email: string }): Promise<{ ok: true }> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: true };
  }

  const supabase = await createSupabaseServerClient();
  // Build the redirect URL from the request's actual Host header so a
  // user submitting from a LAN IP / preview deployment gets a link
  // back to that same host (not the build-time `BRANDING.appUrl`).
  // Supabase rejects redirect URLs that don't match its allowlist ;
  // see `supabase/config.toml > additional_redirect_urls`.
  const appUrl = await getRequestAppUrl();
  await supabase.auth
    .resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/confirm?type=recovery`,
    })
    .catch(() => {
      // Swallow: surfacing transport errors here would also leak signal
      // about which addresses Supabase recognises. Worst case the user
      // re-requests after the rate-limit window.
    });
  return { ok: true };
}

export type VerifyRecoveryOtpErrorCode = "invalidCode" | "missing";

export type VerifyRecoveryOtpResult = { ok: false; errorCode: VerifyRecoveryOtpErrorCode };

// Manual-entry path for the 6-digit code in the recovery email — useful
// when the link in the inbox doesn't open cleanly (mobile mail clients,
// proxied previews that consume the token, etc.). On success the
// recovery session is live ; we redirect to /auth/reset-password (same
// landing page the link path uses) so the user picks a new password.
export async function verifyRecoveryOtpAction(input: {
  email: string;
  token: string;
}): Promise<VerifyRecoveryOtpResult | void> {
  const email = input.email?.trim().toLowerCase();
  const token = input.token?.trim();
  if (!email || !token) {
    return { ok: false, errorCode: "missing" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type: "recovery",
    email,
    token,
  });
  if (error || !data.user || !data.session) {
    return { ok: false, errorCode: "invalidCode" };
  }
  redirect("/auth/reset-password");
}
