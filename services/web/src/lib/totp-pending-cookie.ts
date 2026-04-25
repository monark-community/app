import "server-only"
import { cookies } from "next/headers"

export const TOTP_PENDING_COOKIE = "monark_totp_pending"
// 10 minutes is enough for a user to fish out their authenticator app without
// letting a stolen Supabase cookie ride the "pending" state indefinitely.
const PENDING_TTL_SECONDS = 60 * 10
// Sentinel value stored when we have no trusted-device id to associate
// (flag off, or recognize failed). The pending gate still engages.
const NO_DEVICE = "_"

export async function setTotpPending(trustedDeviceId: string | null): Promise<void> {
  const store = await cookies()
  store.set(TOTP_PENDING_COOKIE, trustedDeviceId ?? NO_DEVICE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_TTL_SECONDS,
  })
}

export async function readTotpPending(): Promise<
  { pending: true; trustedDeviceId: string | null } | { pending: false }
> {
  const store = await cookies()
  const raw = store.get(TOTP_PENDING_COOKIE)?.value
  if (!raw) return { pending: false }
  return {
    pending: true,
    trustedDeviceId: raw === NO_DEVICE ? null : raw,
  }
}

export async function clearTotpPending(): Promise<void> {
  const store = await cookies()
  store.delete(TOTP_PENDING_COOKIE)
}
