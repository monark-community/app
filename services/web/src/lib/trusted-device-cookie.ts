import "server-only"
import { cookies, headers } from "next/headers"
import { createServerTrpcClient } from "./trpc-server"

export const DEVICE_COOKIE_NAME = "monark_device_id"
const MAX_AGE_SECONDS = 60 * 60 * 24 * 400

// Per-request enforcement: returns true when the request comes from a
// device the user has actively trusted (cookie present + matches a non-
// revoked TrustedDevice row). Returns false when the cookie is missing,
// stale, or matches a revoked / different-user record. The (authed)
// layout uses this to evict sessions whose device was revoked from
// elsewhere ; emergency lockout works because the second a row's
// revokedAt is stamped, every other browser fails this check on its
// next page load.
//
// When the `auth.trusted-devices` feature flag is off, this returns
// `true` unconditionally so we don't lock out users while the feature
// is killswitched. The flag check goes through the same tRPC channel
// used elsewhere ; cheap because the resolver caches per-request.
export async function isCurrentDeviceTrusted(input: {
  accessToken: string
  userId: string
}): Promise<boolean> {
  const api = createServerTrpcClient(input.accessToken)
  const flagOn = await api.featureFlags.get
    .query({ key: "auth.trusted-devices", scope: { userId: input.userId } })
    .catch(() => true)
  if (!flagOn) return true

  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(DEVICE_COOKIE_NAME)?.value ?? null
  if (!cookieValue) return false

  const matched = await api.auth.trustedDevices.currentDeviceId
    .query({ cookieValue })
    .catch(() => null)
  return matched !== null
}

// No-verify JWT claim extraction. Safe because the api verifies the same
// token via `supabase.auth.getUser(token)` immediately after; we're just
// reading a claim we already trust to scope the per-device session record.
function extractSessionId(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1]
    if (!payload) return null
    const json = Buffer.from(payload, "base64url").toString("utf8")
    const claims = JSON.parse(json) as { session_id?: unknown }
    return typeof claims.session_id === "string" ? claims.session_id : null
  } catch {
    return null
  }
}

// Loopback addresses (Next dev server fills `x-forwarded-for` with `::1`
// even though there's no real proxy). Persisting these means the
// /account UI shows `::1` for every dev sign-in ; cleaner to treat them
// as "no IP" and let the card render its dev-mode "Local development"
// fallback.
function isLoopbackIp(ip: string): boolean {
  return ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1"
}

// Hosting-platform edge headers carrying the request's country code.
// Listed in the order we'd expect them when running behind each
// platform ; first non-empty wins. Self-hosted-no-proxy returns null
// (no header set) and the column stays null in the DB until a GeoIP
// lookup is wired.
const EDGE_COUNTRY_HEADERS = [
  "x-vercel-ip-country",      // Vercel
  "cf-ipcountry",             // Cloudflare
  "cloudfront-viewer-country", // AWS CloudFront
  "x-country-code",           // Generic / Render / Fly proxies
]

function readCountryFromHeaders(hdrs: Headers): string | null {
  for (const name of EDGE_COUNTRY_HEADERS) {
    const value = hdrs.get(name)?.trim().toUpperCase()
    // Vercel returns "XX" when the lookup fails ; treat that the same
    // as missing rather than persisting it as a real country code.
    if (value && value.length === 2 && value !== "XX") return value
  }
  return null
}

// Reads the User-Agent Client Hints the middleware opted into via
// `Accept-CH`. The browser strips the surrounding double-quotes from
// these high-entropy hints automatically — we just trim and discard
// the empty / whitespace-only values that some clients send when
// they've decided not to disclose the hint. UA-CH values come quoted
// per the spec ; strip the wrapping quotes here too so downstream
// consumers see the bare model string.
type ClientHints = {
  model?: string
  platformVersion?: string
  fullVersionList?: string
}

function unquote(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim().replace(/^"(.*)"$/, "$1").trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readClientHints(hdrs: Headers): ClientHints | null {
  const model = unquote(hdrs.get("sec-ch-ua-model"))
  const platformVersion = unquote(hdrs.get("sec-ch-ua-platform-version"))
  const fullVersionList = unquote(hdrs.get("sec-ch-ua-full-version-list"))
  if (!model && !platformVersion && !fullVersionList) return null
  return { model, platformVersion, fullVersionList }
}

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
    // Geolocation is meaningless in dev — there's no reverse proxy to
    // surface a real client IP, no edge geo header to surface a
    // country, and a phone hitting the dev server over the LAN
    // produces an RFC 1918 IP we can't translate to anything useful
    // anyway. Skip the capture entirely and let the trusted-device
    // card render its "Local development" fallback (already gated on
    // `NODE_ENV !== "production"` + null IP + null country). UA-CH is
    // still captured because it's useful for testing the model
    // detection path locally.
    const isProd = process.env.NODE_ENV === "production"
    const rawIp = isProd
      ? (hdrs.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null
      : null
    const ip = rawIp && !isLoopbackIp(rawIp) ? rawIp : null
    const country = isProd ? readCountryFromHeaders(hdrs) : null
    const clientHints = readClientHints(hdrs)
    const supabaseSessionId = extractSessionId(accessToken)

    const api = createServerTrpcClient(accessToken)
    const result = await api.auth.trustedDevices.recognize.mutate({
      userAgent,
      ip,
      country,
      clientHints,
      existingCookieValue,
      supabaseSessionId,
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
