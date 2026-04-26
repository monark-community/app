import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createServerTrpcClient } from "@/lib/trpc-server"
import { recognizeDeviceAfterAuth } from "@/lib/trusted-device-cookie"

// Two possible arrival shapes:
//   1. `?token_hash=...&type=...` ; direct link from a custom email template.
//   2. No token_hash ; Supabase's default template sent the user through
//      `/auth/v1/verify` first, which already set the session cookie and 302'd here.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type") ?? "email"
  const errorCode = url.searchParams.get("error_code") ?? url.searchParams.get("error")

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
    if (error || !data.user || !data.session) {
      return NextResponse.redirect(
        new URL(
          `/auth/confirm-error?reason=${encodeURIComponent(error?.code ?? "invalid")}`,
          url.origin,
        ),
        { headers: noReferrer },
      )
    }
    const accessToken = data.session.access_token
    const api = createServerTrpcClient(accessToken)

    // Email-change confirmation: Supabase just rotated auth.users.email;
    // mirror the new value into our shadow row and force sign-out so the
    // user re-authenticates with the new address.
    if (type === "email_change") {
      const newEmail = data.user.email
      if (newEmail) {
        await api.users.syncEmail.mutate({ email: newEmail }).catch(() => {})
      }
      await supabase.auth.signOut({ scope: "local" })
      return NextResponse.redirect(
        new URL("/signin?emailChanged=1", url.origin),
        { headers: noReferrer },
      )
    }

    await api.auth.markOwnEmailVerified.mutate().catch(() => {
      // Best-effort shadow-table update.
    })
    await recognizeDeviceAfterAuth(accessToken)
    return NextResponse.redirect(new URL("/account", url.origin), { headers: noReferrer })
  }

  // No token in the URL; Supabase already verified server-side and set the
  // session cookie. Trust the cookie-backed session + mirror the state.
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const user = sessionData.session?.user ?? null
  const accessToken = sessionData.session?.access_token
  if (sessionError || !user || !user.email_confirmed_at || !accessToken) {
    return NextResponse.redirect(new URL("/auth/confirm-error?reason=missing", url.origin), {
      headers: noReferrer,
    })
  }
  const api = createServerTrpcClient(accessToken)
  await api.auth.markOwnEmailVerified.mutate().catch(() => {})
  await recognizeDeviceAfterAuth(accessToken)
  return NextResponse.redirect(new URL("/account", url.origin), { headers: noReferrer })
}
