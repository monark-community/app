import { createHmac, randomBytes } from "node:crypto";

// OAuth 1.0a request signing (HMAC-SHA1), the auth X requires to post on a
// user's behalf. There is no static header to hand `createRestClient` — the
// signature depends on the method, URL, and every parameter — so this is a
// per-request signer the Twitter client calls directly (a third integration
// client shape after GitHub's bearer and Telegram's token-in-path). Kept a pure
// module (only `node:crypto`) so the base-string + signature logic is unit-
// testable against X's published example.

export interface OAuth1Credentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

/** RFC 3986 percent-encoding (stricter than `encodeURIComponent` — also `!*'()`). */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * The OAuth 1.0a signature base string : `METHOD&encode(baseUrl)&encode(params)`,
 * where every parameter (the `oauth_*` set plus any query/body params) is
 * percent-encoded, sorted by encoded key, and joined `k=v` with `&`. `baseUrl`
 * must be the bare endpoint (no query string).
 */
export function signatureBaseString(
  method: string,
  baseUrl: string,
  params: Record<string, string>,
): string {
  const encoded = Object.entries(params).map(
    ([k, v]) => [percentEncode(k), percentEncode(v)] as const,
  );
  encoded.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  const paramString = encoded.map(([k, v]) => `${k}=${v}`).join("&");
  return `${method.toUpperCase()}&${percentEncode(baseUrl)}&${percentEncode(paramString)}`;
}

/**
 * The base64 HMAC-SHA1 signature over the base string, keyed by
 * `encode(consumerSecret)&encode(tokenSecret)`.
 */
export function oauth1Signature(
  method: string,
  baseUrl: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): string {
  const base = signatureBaseString(method, baseUrl, params);
  const key = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return createHmac("sha1", key).update(base).digest("base64");
}

/**
 * Build a signed OAuth 1.0a `Authorization` header for a request. `query` are
 * the URL query params (included in the signature) ; the JSON body is NOT part
 * of an OAuth 1.0a signature (only `application/x-www-form-urlencoded` bodies
 * are, which the X v2 API doesn't use), so callers don't pass it here.
 * `nonce` / `timestamp` are injectable for deterministic tests ; production
 * uses a random nonce + the current unix time.
 */
export function buildAuthHeader(params: {
  method: string;
  baseUrl: string;
  query?: Record<string, string>;
  credentials: OAuth1Credentials;
  nonce?: string;
  timestamp?: string;
}): string {
  const { credentials: c } = params;
  const oauth: Record<string, string> = {
    oauth_consumer_key: c.consumerKey,
    oauth_nonce: params.nonce ?? randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: params.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_token: c.accessToken,
    oauth_version: "1.0",
  };
  const signature = oauth1Signature(
    params.method,
    params.baseUrl,
    { ...oauth, ...(params.query ?? {}) },
    c.consumerSecret,
    c.accessTokenSecret,
  );
  const header: Record<string, string> = { ...oauth, oauth_signature: signature };
  const parts = Object.keys(header)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(header[k] ?? "")}"`);
  return `OAuth ${parts.join(", ")}`;
}
