"use server"

import { redirect } from "next/navigation"
import {
  markEmailVerified,
  recordResendAttempt,
  type ResendResult,
} from "@monark/auth/server"
import { getByEmail } from "@monark/users/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type ResendErrorCode = "missingEmail" | "alreadyVerified" | "exhausted" | "upstream"

export type ResendActionResult =
  | { ok: true; remaining: number }
  | { ok: false; errorCode: ResendErrorCode; retryAfterSeconds?: number }

export async function resendConfirmationAction(email: string): Promise<ResendActionResult> {
  if (!email) return { ok: false, errorCode: "missingEmail" }

  const user = await getByEmail(email)
  if (!user) {
    // Don't leak whether the email exists; pretend success.
    return { ok: true, remaining: 0 }
  }
  if (user.emailVerifiedAt) {
    return { ok: false, errorCode: "alreadyVerified" }
  }

  const limit: ResendResult = await recordResendAttempt(user.id)
  if (!limit.sent) {
    return {
      ok: false,
      errorCode: "exhausted",
      retryAfterSeconds: limit.retryAfterSeconds,
    }
  }

  const supabase = await createSupabaseServerClient()
  const { error: resendError } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/confirm`,
    },
  })
  if (resendError) {
    return { ok: false, errorCode: "upstream" }
  }

  return { ok: true, remaining: limit.remainingInWindow }
}

export type VerifyOtpErrorCode = "invalidCode"

export type VerifyOtpActionResult = { ok: false; errorCode: VerifyOtpErrorCode }

export async function verifyOtpAction(input: {
  email: string
  token: string
}): Promise<VerifyOtpActionResult | void> {
  const email = input.email?.trim()
  const token = input.token?.trim()
  if (!email || !token) {
    return { ok: false, errorCode: "invalidCode" }
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.verifyOtp({
    type: "signup",
    email,
    token,
  })
  if (error || !data.user) {
    return { ok: false, errorCode: "invalidCode" }
  }

  await markEmailVerified(data.user.id)
  redirect("/")
}
