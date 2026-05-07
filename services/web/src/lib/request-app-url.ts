import "server-only"
import { headers } from "next/headers"
import { BRANDING } from "@monark/branding"

/**
 * Builds the canonical app URL ("scheme://host[:port]") for the
 * current Next request, with no trailing slash. Falls back to
 * `BRANDING.appUrl` when called outside a request scope.
 *
 * Why per-request (vs reading `BRANDING.appUrl` directly) :
 * `BRANDING.appUrl` is baked at build time from `APP_URL` /
 * `NEXT_PUBLIC_APP_URL`. In local dev it's `http://localhost:3000` ;
 * if a developer opens the app from a phone on the LAN
 * (`http://10.0.0.42:3000`), any email link built from
 * `BRANDING.appUrl` lands on the *phone's* localhost (404). Reading
 * the request Host header instead means the email link points at
 * whatever host the user actually typed into their browser.
 *
 * In production behind a reverse proxy, `x-forwarded-proto` +
 * `x-forwarded-host` are honoured first so we get the public-facing
 * URL even when the app server itself sees a private one.
 *
 * Used by every email-link builder (signup confirm, password reset,
 * confirmation resend) so the recipient's link matches the device
 * they signed up on.
 */
export async function getRequestAppUrl(): Promise<string> {
  try {
    const hdrs = await headers()
    const proto = (hdrs.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http"
    const host =
      (hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "").split(",")[0]?.trim() || ""
    if (!host) return BRANDING.appUrl
    return `${proto}://${host}`.replace(/\/$/, "")
  } catch {
    // `headers()` throws when called outside a request scope (e.g.
    // cron jobs, scripts). Fall back to the static branding URL.
    return BRANDING.appUrl
  }
}
