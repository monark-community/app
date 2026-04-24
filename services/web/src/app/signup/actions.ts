"use server"

import { redirect } from "next/navigation"
import { signUpUser, emitSignedIn } from "@monark/auth/server"
import { AppError } from "@monark/common"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type SignUpActionResult =
  | { ok: true }
  | { ok: false; error: string }

export async function signUpAction(input: {
  email: string
  password: string
  displayName?: string
}): Promise<SignUpActionResult> {
  try {
    const result = await signUpUser(input, {
      supabaseUrl: process.env.SUPABASE_URL!,
      supabaseSecretKey: process.env.SUPABASE_SECRET_KEY!,
    })

    // Auto-sign-in so the user lands with a session cookie already set.
    const supabase = await createSupabaseServerClient()
    const signIn = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    })
    if (signIn.error) {
      return { ok: false, error: signIn.error.message }
    }

    await emitSignedIn({ userId: result.userId })
  } catch (error) {
    const message =
      error instanceof AppError ? error.message : "Unexpected error during signup."
    return { ok: false, error: message }
  }

  redirect("/")
}
