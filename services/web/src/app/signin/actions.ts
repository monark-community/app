"use server"

import { redirect } from "next/navigation"
import { emitSignedIn, emitSignedOut } from "@monark/auth/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type SignInActionResult =
  | { ok: true }
  | { ok: false; error: string }

export async function signInAction(input: {
  email: string
  password: string
}): Promise<SignInActionResult> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  })

  if (error || !data.user) {
    return { ok: false, error: "Email or password is incorrect." }
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
