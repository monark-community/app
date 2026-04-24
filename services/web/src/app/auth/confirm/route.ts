import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createServerTrpcClient } from "@/lib/trpc-server"

// Two possible arrival shapes:
//   1. `?token_hash=...&type=...` ; direct link from a custom email template.
//   2. No token_hash ; Supabase's default template sent the user through
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
    if (error || !data.user || !data.session) {
      return NextResponse.redirect(
        new URL(
          `/auth/confirm-error?reason=${encodeURIComponent(error?.code ?? "invalid")}`,
          url.origin,
        ),
        { headers: noReferrer },
      )
    }
    const api = createServerTrpcClient(data.session.access_token)
    await api.auth.markOwnEmailVerified.mutate().catch(() => {
      // Best-effort shadow-table update.
    })
    return NextResponse.redirect(new URL("/", url.origin), { headers: noReferrer })
  }

  // No token in the URL; Supabase already verified server-side and set the
  // session cookie. Trust the cookie-backed session + mirror the state.
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const user = sessionData.session?.user ?? null
  const accessToken = sessionData.session?.access_token
  console.log("[/auth/confirm] no-token path getSession", {
    errorMessage: sessionError?.message ?? null,
    userId: user?.id ?? null,
    email_confirmed_at: user?.email_confirmed_at ?? null,
  })
  if (sessionError || !user || !user.email_confirmed_at || !accessToken) {
    return NextResponse.redirect(new URL("/auth/confirm-error?reason=missing", url.origin), {
      headers: noReferrer,
    })
  }
  const api = createServerTrpcClient(accessToken)
  await api.auth.markOwnEmailVerified.mutate().catch(() => {})
  return NextResponse.redirect(new URL("/", url.origin), { headers: noReferrer })
}
