"use server"

import { redirect } from "next/navigation"
import { signUpUser, emitSignedIn } from "@monark/auth/server"
import { ConflictError, ValidationError } from "@monark/common"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type SignUpErrorCode = "weakPassword" | "emailInUse" | "fallback"

export type SignUpActionResult =
  | { ok: true }
  | { ok: false; errorCode: SignUpErrorCode }

export async function signUpAction(input: {
  email: string
  password: string
  displayName?: string
}): Promise<SignUpActionResult> {
  let result
  try {
    result = await signUpUser(input, {
      supabaseUrl: process.env.SUPABASE_URL!,
      supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      supabaseSecretKey: process.env.SUPABASE_SECRET_KEY!,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    })
  } catch (error) {
    if (error instanceof ConflictError) return { ok: false, errorCode: "emailInUse" }
    if (error instanceof ValidationError) return { ok: false, errorCode: "weakPassword" }
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
  if (!signIn.error && signIn.data.user) {
    await emitSignedIn({ userId: result.userId })
  }

  if (!result.needsEmailVerification) {
    redirect("/")
  }
  const encoded = encodeURIComponent(result.email)
  redirect(`/signup/check-email?email=${encoded}`)
}
