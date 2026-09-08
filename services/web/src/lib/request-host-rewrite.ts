import "server-only";
import { headers } from "next/headers";
import { swapLoopbackHost } from "./dev-host-rewrite";

/**
 * Server-side twin of
 * [`rewriteForCurrentHost`](./dev-host-rewrite.ts), for URLs that are
 * rendered into the HTML rather than fetched by the browser.
 *
 * The client helper reads `window.location`, so it is a no-op during
 * SSR — it returns the configured URL untouched and there is no
 * hydration pass to correct it on a server-rendered surface. The brand
 * mark on `/signin` is exactly that: a server component, painted before
 * any client JS runs. Its `src` is the singleton org's stored
 * `logoUrl`, an absolute URL built from the Supabase origin at upload
 * time (`http://127.0.0.1:54321/storage/...`). Opened from a phone on
 * the LAN, that points at the *phone's* own loopback and the image
 * breaks — the one broken element on an otherwise working page.
 *
 * Reading the request's `Host` header gives us the host the user
 * actually typed, which is the same trick
 * [request-app-url.ts](./request-app-url.ts) uses for email links.
 *
 * Two guards, because this twin reads an attacker-influencable header
 * while the browser-side one reads `window.location` and can trust it:
 *
 *  1. `swapLoopbackHost` only rewrites a *configured* URL that is
 *     itself loopback. A deployed Supabase origin never is, so a
 *     spoofed `Host` can never relocate a production asset URL. This
 *     is deliberately not an `NODE_ENV` check, so a production build
 *     smoke-tested from a phone (`pnpm build && pnpm start`) still
 *     renders its logo.
 *  2. The destination must be a private host. Same RFC 1918 + loopback
 *     shape the api's dev CORS escape hatch already allows
 *     (`PRIVATE_HOST_RE` in services/api/src/server.ts), plus
 *     link-local, CGNAT (Tailscale et al) and mDNS `.local` names,
 *     which is the full set of things a phone on your own network
 *     actually resolves as. Without this, a `Host: evil.example`
 *     against a dev server would point the brand `<img>` at someone
 *     else's origin.
 */
const PRIVATE_HOST_RE =
  /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])(?:\.\d{1,3}){2}|\[f[cd][0-9a-f]{2}:.*\]|[^.]+\.local)$/i;
export async function rewriteForRequestHost<T extends string | null | undefined>(
  configured: T,
): Promise<T> {
  if (!configured) return configured;
  try {
    const hdrs = await headers();
    const rawHost =
      (hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "").split(",")[0]?.trim() || "";
    if (!rawHost) return configured;
    // Parse rather than split on ":" so an IPv6 literal (`[::1]:3000`)
    // and a bare host both yield the right hostname.
    let hostname: string;
    try {
      hostname = new URL(`http://${rawHost}`).hostname;
    } catch {
      return configured;
    }
    if (!PRIVATE_HOST_RE.test(hostname)) return configured;
    return swapLoopbackHost(configured, hostname) as T;
  } catch {
    // `headers()` throws outside a request scope (static generation,
    // scripts). Nothing to rewrite against ; hand back the original.
    return configured;
  }
}
