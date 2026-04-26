"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { TRPCClientError } from "@trpc/client"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createServerTrpcClient } from "@/lib/trpc-server"
import { recognizeDeviceAfterAuth } from "@/lib/trusted-device-cookie"

export type SignUpErrorCode = "weakPassword" | "emailInUse" | "fallback"

export type SignUpActionResult =
  | { ok: true }
  | { ok: false; errorCode: SignUpErrorCode }

const SUPPORTED_LOCALES = ["en", "fr"] as const
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

// Picks the highest-q-weighted Accept-Language tag we support, falling back
// to undefined when nothing matches (server then uses the schema default).
function pickLocaleFromHeader(header: string | null): SupportedLocale | undefined {
  if (!header) return undefined
  const ranked = header
    .split(",")
    .map((entry) => {
      const [tag, ...params] = entry.trim().split(";")
      const qParam = params.find((p) => p.trim().startsWith("q="))
      const q = qParam ? Number.parseFloat(qParam.split("=")[1] ?? "1") : 1
      return { tag: (tag ?? "").toLowerCase(), q: Number.isFinite(q) ? q : 1 }
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.q - a.q)
  for (const { tag } of ranked) {
    const primary = tag.split("-")[0] as SupportedLocale | undefined
    if (primary && (SUPPORTED_LOCALES as readonly string[]).includes(primary)) {
      return primary
    }
  }
  return undefined
}

export async function signUpAction(input: {
  email: string
  password: string
  displayName?: string
}): Promise<SignUpActionResult> {
  const api = createServerTrpcClient()
  const hdrs = await headers()
  const localePreference = pickLocaleFromHeader(hdrs.get("accept-language"))
  let result
  try {
    result = await api.auth.signUp.mutate({ ...input, localePreference })
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
