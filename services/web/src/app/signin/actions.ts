"use server"

import { redirect } from "next/navigation"
import { emitSignedIn, emitSignedOut } from "@monark/auth/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type SignInErrorCode = "invalidCredentials"

export type SignInActionResult =
  | { ok: true }
  | { ok: false; errorCode: SignInErrorCode }

export async function signInAction(input: {
  email: string
  password: string
}): Promise<SignInActionResult> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  })

  if (error?.code === "email_not_confirmed") {
    const encoded = encodeURIComponent(input.email)
    redirect(`/signup/check-email?email=${encoded}`)
  }

  if (error || !data.user) {
    return { ok: false, errorCode: "invalidCredentials" }
  }

  if (!data.user.email_confirmed_at) {
    await supabase.auth.signOut({ scope: "local" })
    const encoded = encodeURIComponent(data.user.email ?? input.email)
    redirect(`/signup/check-email?email=${encoded}`)
  }

  await emitSignedIn({ userId: data.user.id })
  redirect("/")
}

export async function signOutAction(scope: "local" | "global" = "local"): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  await supabase.auth.signOut({ scope })
  if (data.user) {
    await emitSignedOut({ userId: data.user.id, scope })
  }
  redirect("/signin")
}
