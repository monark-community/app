import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { ValidationError } from "./errors";

// Shared server-only outbound-HTTP guard + fetch wrapper. Any code that calls an
// operator-supplied URL (the webhooks subscription target, the automation
// webhook node, future integration nodes) routes through here so the scheme /
// host rules and the timeout behavior stay identical across the codebase.

// Loopback + RFC 1918 private ranges (10/8, 172.16/12, 192.168/16). The same
// host shape the api's dev CORS layer accepts, so an `http://` target in
// development gets the same treatment everywhere.
const PRIVATE_HOST_RE =
  /^(localhost|127\.0\.0\.1|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/;

// Fail CLOSED: anything not explicitly a known dev/test value is treated as
// production, so a deploy that forgets to set `NODE_ENV=production` gets the
// strict policy rather than the permissive dev one.
function isProduction(): boolean {
  const env = process.env.NODE_ENV;
  return env !== "development" && env !== "test";
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true; // "this network", private, loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0/24 IETF
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a >= 224) return true; // 224/4 multicast + 240/4 reserved + 255.255.255.255
  return false;
}

/**
 * Whether a host string is a LITERAL IP address in a private / loopback /
 * link-local / reserved range (the SSRF-relevant targets). Returns false for a
 * hostname (not an IP literal) — DNS resolution of hostnames is handled
 * separately, at fetch time, by {@link safeFetch}.
 */
function isPrivateOrReservedIp(host: string): boolean {
  const ip = host.replace(/^\[|\]$/g, ""); // strip IPv6 URL brackets
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    // IPv4-mapped, dotted (::ffff:127.0.0.1) — as typed.
    const mappedDotted = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mappedDotted?.[1]) return isPrivateIPv4(mappedDotted[1]);
    // IPv4-mapped, hex (::ffff:7f00:1) — the form the WHATWG URL parser normalizes to.
    const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex?.[1] && mappedHex[2]) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return isPrivateIPv4(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`);
    }
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 ULA
    if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
    if (lower.startsWith("ff")) return true; // ff00::/8 multicast
    return false;
  }
  return false;
}

/**
 * Validate an operator-supplied outbound URL:
 *
 *   - `https://` is accepted for public hosts, but REJECTED when the host is a
 *     literal private / loopback / link-local / reserved IP (blocks direct SSRF
 *     to internal services and cloud-metadata endpoints over TLS).
 *   - `http://` is accepted ONLY in non-production AND only when the host is
 *     loopback or RFC 1918 private (local dev against a mock receiver or a
 *     sibling docker service without standing up TLS).
 *   - Anything else (file://, ws://, plain http to a public host, missing
 *     scheme, malformed URL) is rejected.
 *
 * Throws {@link ValidationError} so a tRPC caller gets a 400 and a node fails its
 * step with the message. `NODE_ENV` is read directly from `process.env` (fail
 * closed — see {@link isProduction}).
 *
 * LIMITATION: this is a scheme + literal-host check ; it does not resolve DNS. A
 * public *hostname* that resolves to an internal IP (DNS-rebinding SSRF) is
 * caught at fetch time by {@link safeFetch}'s production resolution guard, not
 * here. Callers that issue their own `fetch` must run that guard themselves.
 */
export function assertOutboundUrlSafe(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError(
      "URL must be an absolute https:// URL (http:// is allowed only for private/loopback hosts in development).",
    );
  }
  if (parsed.protocol === "https:") {
    if (isPrivateOrReservedIp(parsed.hostname)) {
      throw new ValidationError(
        "URL host is a private or reserved IP address, which is not an allowed target.",
      );
    }
    return;
  }
  if (parsed.protocol === "http:") {
    if (isProduction()) {
      throw new ValidationError("URL must be https:// in production.");
    }
    if (PRIVATE_HOST_RE.test(parsed.hostname)) return;
    throw new ValidationError(
      "URL over http:// is allowed in development only for loopback or private (RFC 1918) hosts. Use https:// for public targets.",
    );
  }
  throw new ValidationError(
    `URL scheme "${parsed.protocol}" is not supported ; use https:// (or http:// for a private host in development).`,
  );
}

/**
 * In production, resolve `hostname` and reject when ANY resolved address is a
 * private / reserved IP — defends against a public hostname (or a rebind) that
 * points at an internal service. Skipped in dev/test, where loopback targets are
 * legitimately used. A literal IP is already vetted by
 * {@link assertOutboundUrlSafe}, so it's skipped here.
 *
 * Residual: there is still a small TOCTOU between this lookup and `fetch`'s own
 * resolution (a rebind in that window). Fully closing it needs a pinned
 * dispatcher; this guard covers the practical cases.
 */
async function assertHostResolvesPublic(hostname: string): Promise<void> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare) !== 0) return; // literal IP already checked by the scheme guard
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(bare, { all: true, verbatim: true });
  } catch {
    return; // let fetch surface the DNS failure rather than masking it
  }
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new ValidationError(
        "URL host resolves to a private or reserved IP address, which is not an allowed target.",
      );
    }
  }
}

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Abort the request after this many ms (default 10s). */
  timeoutMs?: number;
  /**
   * Cap the response body at this many bytes. When set, the body is streamed and
   * the request throws {@link ValidationError} if it exceeds the cap, so a
   * hostile receiver can't force an unbounded read. The returned `Response` is
   * reconstructed with the (bounded) body, so `.ok` / `.status` / `.text()` all
   * still work. Omit to return the raw `Response` unread (the default).
   */
  maxBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Read a response body, aborting if it exceeds `maxBytes`, then return a fresh
 * `Response` carrying the bounded bytes (status / headers preserved).
 */
async function capResponseBody(res: Response, maxBytes: number): Promise<Response> {
  const reader = res.body?.getReader();
  if (!reader) return res; // no body (e.g. 204 / redirect)
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ValidationError(`Response body exceeded the ${maxBytes}-byte cap.`);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

/**
 * Guarded outbound fetch: runs {@link assertOutboundUrlSafe} on the URL, adds a
 * production DNS-resolution guard, then issues the request with an
 * AbortController timeout and `redirect: "manual"` (so a 3xx to an unvalidated
 * internal target is NOT transparently followed — it comes back as a non-ok
 * response for the caller to reject). Returns the raw `Response`. Throws
 * {@link ValidationError} for a rejected / internal-resolving URL and the
 * underlying fetch error (including an AbortError on timeout) otherwise.
 */
export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<Response> {
  assertOutboundUrlSafe(url);
  if (isProduction()) {
    await assertHostResolvesPublic(new URL(url).hostname);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
      redirect: "manual",
    });
    // The body read stays inside the timeout window so a slow-drip body can't
    // outlast the abort.
    return options.maxBytes == null ? res : await capResponseBody(res, options.maxBytes);
  } finally {
    clearTimeout(timer);
  }
}
