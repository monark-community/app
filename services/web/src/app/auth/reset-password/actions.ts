"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { clearTotpPending } from "@/lib/totp-pending-cookie";

export type ResetPasswordErrorCode =
  | "noSession"
  | "weakPassword"
  | "totpRequired"
  | "invalidTotpCode"
  | "upstream";

export type ResetPasswordResult = { ok: true } | { ok: false; errorCode: ResetPasswordErrorCode };

// Closes out the password-recovery flow. The user arrived here through
// /auth/confirm?type=recovery which has already exchanged the recovery
// token for a temporary Supabase session ; we apply the new password,
// emit the password-changed event so the security email fires, then
// sign the user out so they re-authenticate normally with the new
// credentials. The next sign-in puts them back through the trusted-
// device + TOTP flows.
//
// Strength enforcement runs through `auth.checkPassword` (same path as
// signup + the in-account change) so all three surfaces share one rule
// set: minLength + char-class mix + "doesn't contain email" + HIBP.
//
// **TOTP gate.** When the user has TOTP enrolled, the email-link
// recovery alone is not enough — email compromise (SIM swap → carrier
// reset → SMS code → email access) would otherwise convert directly
// into full account takeover and undo the entire purpose of having
// 2FA on the account. So this action requires a TOTP code on top of
// the recovery session for enrolled users, mirroring the in-account
// `changePasswordAction` pattern. Users who lost both authenticator
// AND recovery codes go through the out-of-band support path
// documented in [docs/technical-documentation/account-recovery.md].
//
// We deliberately do not require the current password here ; the user
// landed on this page because they don't know it. The recovery-token
// session is the proof of mailbox control ; TOTP layers on the
// "second factor" guarantee.
export async function resetPasswordAction(input: {
  newPassword: string;
  totpCode?: string;
}): Promise<ResetPasswordResult> {
  const supabase = await createSupabaseServerClient();
  // `getUser` round-trips to the Auth server to validate the recovery-
  // session JWT before we trust its email for the strength check.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user || !userData.user.email) {
    return { ok: false, errorCode: "noSession" };
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return { ok: false, errorCode: "noSession" };
  const api = createServerTrpcClient(accessToken);

  // TOTP gate runs *before* the password update so a missing / invalid
  // code can't half-apply the change. Branches on enrolment status :
  // non-enrolled users skip the gate entirely, enrolled users either
  // supply a code or fall through to the `totpRequired` error so the
  // form can prompt for one.
  const totpStatus = await api.auth.totp.status.query().catch(() => null);
  if (totpStatus && "enrolled" in totpStatus && totpStatus.enrolled) {
    if (!input.totpCode || input.totpCode.length < 6) {
      return { ok: false, errorCode: "totpRequired" };
    }
    const verified = await api.auth.totp.verifyCode
      .mutate({ code: input.totpCode })
      .catch(() => ({ ok: false }));
    if (!verified.ok) {
      return { ok: false, errorCode: "invalidTotpCode" };
    }
  }

  const strength = await api.auth.checkPassword
    .mutate({
      password: input.newPassword,
      email: userData.user.email,
    })
    .catch(() => null);
  if (!strength || !strength.ok) {
    return { ok: false, errorCode: "weakPassword" };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
  });
  if (updateError) return { ok: false, errorCode: "upstream" };

  await api.auth.notifyPasswordChanged.mutate({ triggeredBy: "reset" }).catch(() => {});

  // Drop any leftover pending-totp cookie ; the recovery flow is its
  // own auth proof and the next sign-in will re-arm TOTP if needed.
  await clearTotpPending();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/signin?passwordReset=1");
}
