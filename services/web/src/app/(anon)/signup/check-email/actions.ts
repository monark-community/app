"use server";

import { redirect } from "next/navigation";
import { getRequestAppUrl } from "@/lib/request-app-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { recognizeDeviceAfterAuth } from "@/lib/trusted-device-cookie";

export type ResendErrorCode = "missingEmail" | "alreadyVerified" | "exhausted" | "upstream";

export type ResendActionResult =
  | { ok: true; remaining: number }
  | { ok: false; errorCode: ResendErrorCode; retryAfterSeconds?: number };

export async function resendConfirmationAction(email: string): Promise<ResendActionResult> {
  if (!email) return { ok: false, errorCode: "missingEmail" };

  const api = createServerTrpcClient();
  // Same per-request appUrl trick as signup : forward the real Host
  // so the resent email lands on whatever device the user is on.
  const appUrl = await getRequestAppUrl();
  try {
    return await api.auth.requestConfirmationResend.mutate({ email, appUrl });
  } catch {
    return { ok: false, errorCode: "upstream" };
  }
}

export type VerifyOtpErrorCode = "invalidCode";

export type VerifyOtpActionResult = { ok: false; errorCode: VerifyOtpErrorCode };

export async function verifyOtpAction(input: {
  email: string;
  token: string;
}): Promise<VerifyOtpActionResult | void> {
  const email = input.email?.trim();
  const token = input.token?.trim();
  if (!email || !token) {
    return { ok: false, errorCode: "invalidCode" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type: "signup",
    email,
    token,
  });
  if (error || !data.user || !data.session) {
    return { ok: false, errorCode: "invalidCode" };
  }

  const accessToken = data.session.access_token;
  const api = createServerTrpcClient(accessToken);
  await api.auth.markOwnEmailVerified.mutate().catch(() => {
    // Shadow-table write is best-effort; auth.users is the source of truth.
  });
  await recognizeDeviceAfterAuth(accessToken);
  redirect("/account");
}
