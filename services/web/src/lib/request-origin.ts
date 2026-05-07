import type { NextRequest } from "next/server"

/**
 * Returns the origin (`scheme://host[:port]`) the user actually
 * requested, derived from request headers rather than `request.url` /
 * `request.nextUrl.origin`. Use this when minting a redirect target so
 * the response keeps the user on the same host they came in on.
 *
 * Why not `request.url` :
 *
 * In several common Next.js configurations (Vercel, Docker behind a
 * reverse proxy, the dev server behind `netsh portproxy` we use for
 * LAN-from-phone testing) `request.url` reflects the *internal*
 * loopback address Node sees, not the public URL the browser typed.
 * `new URL("/signin", request.url)` then redirects the user from
 * `http://10.0.0.208:3000/...` to `http://localhost:3000/signin`,
 * which the phone can't reach. Reading `Host` (or
 * `X-Forwarded-Host` when behind a proxy) gives the real public-facing
 * value and survives every routing layer.
 *
 * Fallback chain :
 *
 *   1. `X-Forwarded-Host` + `X-Forwarded-Proto` — set by reverse
 *      proxies that terminate TLS upstream (Vercel, Cloudflare, …).
 *   2. `Host` + the request's own protocol — local dev / direct hits.
 *   3. `request.nextUrl.origin` — last resort if no Host header (some
 *      synthetic requests).
 */
export function getRequestOrigin(request: NextRequest): string {
  const fwdHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  const fwdProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
  if (fwdHost) {
    const proto = fwdProto || request.nextUrl.protocol.replace(":", "") || "http"
    return `${proto}://${fwdHost}`
  }
  const host = request.headers.get("host")?.trim()
  if (host) {
    const proto = request.nextUrl.protocol.replace(":", "") || "http"
    return `${proto}://${host}`
  }
  return request.nextUrl.origin
}
