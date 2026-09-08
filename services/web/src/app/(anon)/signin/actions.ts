"use server";

import { redirect } from "next/navigation";
import { completeSignIn } from "@/lib/complete-sign-in";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { clearTotpPending } from "@/lib/totp-pending-cookie";

export type SignInErrorCode = "invalidCredentials";

export type SignInActionResult = { ok: true } | { ok: false; errorCode: SignInErrorCode };

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<SignInActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error?.code === "email_not_confirmed") {
    const encoded = encodeURIComponent(input.email);
    redirect(`/signup/check-email?email=${encoded}`);
  }

  if (error || !data.user || !data.session) {
    return { ok: false, errorCode: "invalidCredentials" };
  }

  if (!data.user.email_confirmed_at) {
    await supabase.auth.signOut({ scope: "local" });
    const encoded = encodeURIComponent(data.user.email ?? input.email);
    redirect(`/signup/check-email?email=${encoded}`);
  }

  // Device recognition, the TOTP gate, the signed-in event, pending
  // invites and the deletion-grace bounce are shared with the social
  // sign-in callback ; see `completeSignIn`.
  redirect(await completeSignIn(data.session.access_token));
}

export async function signOutAction(scope: "local" | "global" = "local"): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (accessToken) {
    const api = createServerTrpcClient(accessToken);
    await api.auth.notifySignedOut.mutate({ scope }).catch(() => {
      // Best-effort; proceed with local cookie clear regardless.
    });
  }
  await clearTotpPending();
  await supabase.auth.signOut({ scope });
  redirect("/signin");
}
