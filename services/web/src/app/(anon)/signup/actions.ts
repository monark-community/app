"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { TRPCClientError } from "@trpc/client"
import { pickLocaleFromHeader } from "@monark/auth/contracts"
import { getRequestAppUrl } from "@/lib/request-app-url"
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
  const hdrs = await headers()
  const localePreference = pickLocaleFromHeader(hdrs.get("accept-language"))
  // Forward the request's actual host so the confirmation email link
  // matches whatever the user is browsing from (LAN IP, preview
  // deployment, etc.) instead of the build-time `APP_URL` default.
  const appUrl = await getRequestAppUrl()
  let result
  try {
    result = await api.auth.signUp.mutate({ ...input, localePreference, appUrl })
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
    // Auto-accept any pending invites that were targeted at this email.
    // Covers the "admin sent me an invite link, I'm signing up via it"
    // flow — the membership + role assignment land before the user
    // reaches /account.
    await authed.organizations.invites.consumePending.mutate().catch(() => {})
  }

  if (!result.needsEmailVerification) {
    redirect("/account")
  }
  const encoded = encodeURIComponent(result.email)
  redirect(`/signup/check-email?email=${encoded}`)
}
