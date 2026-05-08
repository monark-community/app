import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Production security + UA-CH headers. Dev returns an empty array
// because the strict CSP would block Next's HMR runtime + the
// pretty-error overlay, and HSTS on localhost can lock subsequent
// http://localhost requests until the browser's HSTS cache is
// cleared. The middleware previously injected Accept-CH +
// Permissions-Policy for every request ; they live here in
// production so Vercel can serve them from the edge cache without
// running middleware on each request, and middleware stays focused
// on auth + supabase session refresh + TOTP redirects.
async function buildHeaders() {
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) return [];

  // CSP needs the api + supabase origins in connect-src so the
  // browser can call the api's tRPC endpoint and the supabase
  // realtime / auth / storage hosts. Read at build-time from the
  // env Vercel injects ; if either isn't set the resulting CSP is
  // still safe (just `'self'` + nothing else, which would break the
  // app — surfacing the misconfiguration immediately).
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseWss = supabaseUrl.replace(/^https/, "wss");
  const connectSrc = ["'self'", apiUrl, supabaseUrl, supabaseWss]
    .filter((s) => s.length > 0)
    .join(" ");

  // CSP design notes :
  //   - `script-src 'unsafe-inline'` is unfortunate but Next ships
  //     inline bootstrapping scripts ; replacing this with nonces
  //     is a follow-up. `'unsafe-eval'` is left out — Next prod
  //     builds don't need it, and including it would defeat most
  //     of CSP's value.
  //   - `style-src 'unsafe-inline'` is required for Tailwind +
  //     next-intl + the dynamic CSS-in-JS the components emit.
  //   - `img-src` allows `data:` for inline icon URIs and `https:`
  //     broadly so any avatar / banner CDN works without a per-
  //     host allowlist. Tighten to specific hosts when image
  //     storage moves to a fixed CDN.
  //   - `frame-ancestors 'none'` is the modern X-Frame-Options
  //     replacement ; we keep both headers for older browsers.
  //   - `upgrade-insecure-requests` rewrites mixed-content http://
  //     fetches to https:// before the browser hits the network.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  // Permissions-Policy carries both the lockdown for surfaces we
  // never use (camera / microphone / geolocation / payment, all
  // disabled outright) AND the opt-in for User-Agent Client Hints
  // the trusted-device fingerprinter relies on. One header, comma-
  // separated.
  const permissionsPolicy = [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "payment=()",
    "ch-ua-model=(self)",
    "ch-ua-platform-version=(self)",
    "ch-ua-full-version-list=(self)",
  ].join(", ");

  return [
    {
      source: "/:path*",
      headers: [
        // 2 years, includeSubDomains, preload-eligible. `preload`
        // means we can submit the apex to hstspreload.org once the
        // production cert + every subdomain is HTTPS-only.
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        { key: "Permissions-Policy", value: permissionsPolicy },
        // UA-CH opt-in pair. `Accept-CH` advertises the hints we
        // want ; `Critical-CH` tells the browser the hint applies
        // site-wide so it doesn't have to re-prompt on every nav.
        {
          key: "Accept-CH",
          value: "Sec-CH-UA-Model, Sec-CH-UA-Platform-Version, Sec-CH-UA-Full-Version-List",
        },
        {
          key: "Critical-CH",
          value: "Sec-CH-UA-Model, Sec-CH-UA-Platform-Version",
        },
        { key: "Content-Security-Policy", value: csp },
      ],
    },
  ];
}

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@monark/auth",
    "@monark/common",
    "@monark/components",
    "@monark/feature-flags",
    "@monark/notifications",
    "@monark/users",
  ],
  // Pino + its transports load worker scripts via `require.resolve` at
  // runtime, which Next's bundler can't statically analyse. Marking them
  // external keeps them on Node's normal require chain so the pretty
  // transport (used only in dev, only when stdout is a TTY) initialises
  // correctly without webpack trying to bundle the worker entry.
  serverExternalPackages: ["pino", "pino-pretty"],
  headers: buildHeaders,
};

export default withNextIntl(config);
