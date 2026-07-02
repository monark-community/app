"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { clearTotpPending, readTotpPending } from "@/lib/totp-pending-cookie";

export type TotpChallengeErrorCode = "invalidCode" | "expired";

export type TotpChallengeResult = { ok: true } | { ok: false; errorCode: TotpChallengeErrorCode };

async function currentAccessToken(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function verifyTotpChallengeAction(input: {
  code: string;
  mode: "totp" | "recovery";
}): Promise<TotpChallengeResult> {
  const pending = await readTotpPending();
  if (!pending.pending) return { ok: false, errorCode: "expired" };

  const accessToken = await currentAccessToken();
  if (!accessToken) return { ok: false, errorCode: "expired" };

  const api = createServerTrpcClient(accessToken);
  const trustedDeviceId = pending.trustedDeviceId;

  try {
    const result =
      input.mode === "recovery"
        ? await api.auth.totp.verifyRecoveryCode.mutate({
            code: input.code,
            trustedDeviceId,
          })
        : await api.auth.totp.verifyCode.mutate({
            code: input.code,
            trustedDeviceId,
          });
    if (!result.ok) return { ok: false, errorCode: "invalidCode" };
  } catch {
    return { ok: false, errorCode: "invalidCode" };
  }

  await clearTotpPending();
  await api.auth.notifySignedIn
    .mutate(trustedDeviceId ? { trustedDeviceId } : undefined)
    .catch(() => {});
  redirect("/account");
}
