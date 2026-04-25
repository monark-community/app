"use server"

import { redirect } from "next/navigation"
import { TRPCClientError } from "@trpc/client"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createServerTrpcClient } from "@/lib/trpc-server"
import { recognizeDeviceAfterAuth } from "@/lib/trusted-device-cookie"

export type SignUpErrorCode = "weakPassword" | "emailInUse" | "fallback"

export type SignUpActionResult =
  | { ok: true }
  | { ok: false; errorCode: SignUpErrorCode }

export async function signUpAction(input: {
  email: string
  password: string
  displayName?: string
}): Promise<SignUpActionResult> {
  const api = createServerTrpcClient()
  let result
  try {
    result = await api.auth.signUp.mutate(input)
  } catch (error) {
    if (error instanceof TRPCClientError) {
      if (error.data?.code === "CONFLICT") return { ok: false, errorCode: "emailInUse" }
      if (error.data?.code === "BAD_REQUEST") return { ok: false, errorCode: "weakPassword" }
    }
    return { ok: false, errorCode: "fallback" }
  }

  // Best-effort auto-sign-in: when confirmations are disabled this establishes
  // a session cookie immediately; when they're enabled it silently fails and
  // the check-email page handles the "no session yet" state.
  const supabase = await createSupabaseServerClient()
  const signIn = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  })
  if (!signIn.error && signIn.data.session) {
    const accessToken = signIn.data.session.access_token
    const trustedDeviceId = await recognizeDeviceAfterAuth(accessToken)
    const authed = createServerTrpcClient(accessToken)
    await authed.auth.notifySignedIn
      .mutate(trustedDeviceId ? { trustedDeviceId } : undefined)
      .catch(() => {
        // Event emission is best-effort; signup itself already succeeded.
      })
  }

  if (!result.needsEmailVerification) {
    redirect("/account")
  }
  const encoded = encodeURIComponent(result.email)
  redirect(`/signup/check-email?email=${encoded}`)
}
