"use server"

import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createServerTrpcClient } from "@/lib/trpc-server"
import { recognizeDeviceAfterAuth } from "@/lib/trusted-device-cookie"
import { clearTotpPending, setTotpPending } from "@/lib/totp-pending-cookie"

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

  if (error || !data.user || !data.session) {
    return { ok: false, errorCode: "invalidCredentials" }
  }

  if (!data.user.email_confirmed_at) {
    await supabase.auth.signOut({ scope: "local" })
    const encoded = encodeURIComponent(data.user.email ?? input.email)
    redirect(`/signup/check-email?email=${encoded}`)
  }

  const accessToken = data.session.access_token
  const trustedDeviceId = await recognizeDeviceAfterAuth(accessToken)
  const api = createServerTrpcClient(accessToken)

  // TOTP-gated sign-ins land at /signin/totp; the session cookie is live but
  // the middleware pending-gate keeps the user from reaching protected
  // routes until a code is verified. notifySignedIn waits until then so the
  // event fires once the sign-in is fully complete.
  const challengeRequired = await api.auth.totp.isChallengeRequired
    .query({ trustedDeviceId })
    .catch(() => false)

  if (challengeRequired) {
    await setTotpPending(trustedDeviceId)
    redirect("/signin/totp")
  }

  await clearTotpPending()
  await api.auth.notifySignedIn
    .mutate(trustedDeviceId ? { trustedDeviceId } : undefined)
    .catch(() => {
      // Event emission is best-effort; the session cookie is already set.
    })
  // Auto-accept any pending invites for this user's email — covers the
  // "admin invited me, then I signed in" path. Idempotent so the call
  // is safe on every sign-in. Best-effort : a failure here doesn't
  // block the sign-in itself.
  await api.organizations.invites.consumePending.mutate().catch(() => {})

  // Land deletion-pending users straight on the danger tab so the
  // grace-period banner + Cancel button are the first thing they see.
  // `users.me` returns the shadow row with `deletedAt` set when the
  // account is in the 14-day grace window. The (authed) layout's
  // own redirect logic also forwards them there for any subsequent
  // navigation, but bouncing here saves an extra round-trip on the
  // first request right after sign-in.
  const me = await api.users.me.query().catch(() => null)
  if (me?.deletedAt) {
    redirect("/account/danger")
  }
  redirect("/account")
}

export async function signOutAction(scope: "local" | "global" = "local"): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token

  if (accessToken) {
    const api = createServerTrpcClient(accessToken)
    await api.auth.notifySignedOut.mutate({ scope }).catch(() => {
      // Best-effort; proceed with local cookie clear regardless.
    })
  }
  await clearTotpPending()
  await supabase.auth.signOut({ scope })
  redirect("/signin")
}
