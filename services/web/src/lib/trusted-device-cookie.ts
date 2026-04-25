import "server-only"
import { cookies, headers } from "next/headers"
import { createServerTrpcClient } from "./trpc-server"

export const DEVICE_COOKIE_NAME = "monark_device_id"
const MAX_AGE_SECONDS = 60 * 60 * 24 * 400

// Reads request metadata + the existing device cookie, calls the recognize
// mutation, and writes the fresh cookie when one is minted. Returns the
// device id (or null if the flag is off / recognize was skipped).
//
// Intended to be invoked from server actions / route handlers immediately
// after a Supabase session cookie has been set.
export async function recognizeDeviceAfterAuth(accessToken: string): Promise<string | null> {
  try {
    const [cookieStore, hdrs] = await Promise.all([cookies(), headers()])
    const existingCookieValue = cookieStore.get(DEVICE_COOKIE_NAME)?.value ?? null
    const userAgent = hdrs.get("user-agent")
    // Next is usually behind a proxy; prefer `x-forwarded-for`.
    const ip = (hdrs.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null

    const api = createServerTrpcClient(accessToken)
    const result = await api.auth.trustedDevices.recognize.mutate({
      userAgent,
      ip,
      existingCookieValue,
    })

    if (result.rawCookieValue) {
      cookieStore.set(DEVICE_COOKIE_NAME, result.rawCookieValue, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: MAX_AGE_SECONDS,
      })
    }
    return result.deviceId
  } catch {
    // Trusted-device recognition is best-effort; never block the sign-in
    // flow on its failure.
    return null
  }
}
