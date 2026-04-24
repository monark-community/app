import { NextResponse, type NextRequest } from "next/server"
import { markEmailVerified } from "@monark/auth/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

// Two possible arrival shapes:
//   1. `?token_hash=...&type=...` — direct link from a custom email template.
//   2. No token_hash — Supabase's default template sent the user through
//      `/auth/v1/verify` first, which already set the session cookie and 302'd here.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type") ?? "email"
  const errorCode = url.searchParams.get("error_code") ?? url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  console.log("[/auth/confirm]", {
    fullUrl: request.url,
    tokenHash: tokenHash ? `${tokenHash.slice(0, 6)}…` : null,
    type,
    errorCode,
    errorDescription,
  })

  const noReferrer = { "Referrer-Policy": "no-referrer" }

  if (errorCode) {
    return NextResponse.redirect(
      new URL(`/auth/confirm-error?reason=${encodeURIComponent(errorCode)}`, url.origin),
      { headers: noReferrer },
    )
  }

  const supabase = await createSupabaseServerClient()

  if (tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({
      type: type as "signup" | "email" | "recovery" | "invite" | "email_change",
      token_hash: tokenHash,
    })
    console.log("[/auth/confirm] verifyOtp", {
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null,
      userId: data.user?.id ?? null,
    })
    if (error || !data.user) {
      return NextResponse.redirect(
        new URL(
          `/auth/confirm-error?reason=${encodeURIComponent(error?.code ?? "invalid")}`,
          url.origin,
        ),
        { headers: noReferrer },
      )
    }
    await markEmailVerified(data.user.id)
    return NextResponse.redirect(new URL("/", url.origin), { headers: noReferrer })
  }

  // No token in the URL; Supabase already verified server-side and set the
  // session cookie. Trust the cookie-backed user + mirror the state.
  const { data: userData, error: userError } = await supabase.auth.getUser()
  console.log("[/auth/confirm] no-token path getUser", {
    errorMessage: userError?.message ?? null,
    userId: userData.user?.id ?? null,
    email_confirmed_at: userData.user?.email_confirmed_at ?? null,
  })
  if (userError || !userData.user || !userData.user.email_confirmed_at) {
    return NextResponse.redirect(new URL("/auth/confirm-error?reason=missing", url.origin), {
      headers: noReferrer,
    })
  }
  await markEmailVerified(userData.user.id)
  return NextResponse.redirect(new URL("/", url.origin), { headers: noReferrer })
}
