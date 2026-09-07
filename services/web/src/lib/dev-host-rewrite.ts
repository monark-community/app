/**
 * Dev-only "swap loopback for current host" trick used by browser-side
 * URLs that are baked at build time from `NEXT_PUBLIC_*` env vars.
 *
 * Problem: in local dev a developer's `.env` typically points to
 * `http://localhost:4000` (api), `http://127.0.0.1:54321` (Supabase),
 * etc. Those URLs are inlined into the client bundle. When a phone
 * (or any other device on the LAN) opens the app at
 * `http://10.0.0.42:3000`, the bundled URLs still say "localhost", so
 * the phone tries to reach its OWN loopback for the api / Supabase
 * and everything 404s.
 *
 * Fix: when (a) the configured URL points to a loopback host AND
 * (b) the browser is currently on a non-loopback host, swap the
 * hostname to whatever the browser is on, keeping the configured
 * port + protocol. The two services are presumed to live on the same
 * machine in dev (true for the standard `pnpm dev` setup) so the LAN
 * developer's machine answers on the LAN IP for every port.
 *
 * In production this is a no-op : the configured URL points to the
 * real api host (e.g. `https://api.monark.app`), no swap happens.
 *
 * Server-side calls (SSR, server actions) skip this entirely — they
 * use the literal env value because they're inside the dev machine
 * already and `localhost` resolves correctly.
 */
export function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

/**
 * The pure core of the swap, shared by the browser-side
 * `rewriteForCurrentHost` below and the server-side
 * `rewriteForRequestHost` in
 * [request-host-rewrite.ts](./request-host-rewrite.ts) — the two read
 * the "host the user is actually on" from different places (
 * `window.location` vs the request `Host` header) but must agree
 * exactly on when a swap applies, so the decision lives here once.
 *
 * Returns `configured` untouched unless it points at a loopback host
 * AND `currentHost` is a real one. That single condition is what keeps
 * this inert in production : a deployed Supabase / api URL is never
 * loopback, so nothing is ever rewritten from a request header.
 */
export function swapLoopbackHost(configured: string, currentHost: string): string {
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return configured;
  }
  if (!isLoopbackHost(url.hostname)) return configured;
  if (!currentHost || isLoopbackHost(currentHost)) return configured;
  url.hostname = currentHost;
  // toString preserves the original port + protocol + path + query the
  // source declared, which is exactly what we want : same service, same
  // port, same object — just relocated from loopback to the host the
  // user is actually on.
  return url.toString().replace(/\/$/, "");
}

export function rewriteForCurrentHost(configured: string): string {
  if (typeof window === "undefined") return configured;
  const rewritten = swapLoopbackHost(configured, window.location.hostname);
  // Surface the swap in the dev console so a developer testing from a
  // phone can verify the URL their browser will hit. Stays out of
  // production : `process.env.NODE_ENV` is statically inlined at
  // build time and the dead branch is dropped by the bundler.
  if (process.env.NODE_ENV !== "production" && rewritten !== configured) {
    console.info(`[dev-host-rewrite] ${configured} → ${rewritten}`);
  }
  return rewritten;
}
