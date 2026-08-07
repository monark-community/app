import { safeFetch } from "@monark/common/http";
import type { NodeExecutionContext } from "@monark/automation/server";
import {
  TWITTER_ACCESS_TOKEN_SECRET,
  TWITTER_ACCESS_TOKEN_SECRET_SECRET,
  TWITTER_CONSUMER_KEY_SECRET,
  TWITTER_CONSUMER_SECRET_SECRET,
} from "../contracts/twitter";
import { buildAuthHeader, type OAuth1Credentials } from "./oauth1";

// X (Twitter) API v2 over the shared SSRF-guarded `safeFetch`. Like Telegram,
// this doesn't fit the kit's `createRestClient` — X authenticates with a
// per-request OAuth 1.0a signature (see oauth1.ts), not a static header — so the
// client signs + calls `safeFetch` itself, while still reusing the kit's
// `pickString` for reading the loosely-typed response. Responses are
// `{ data }` on success or `{ errors | detail | title }` on failure.

const API_ROOT = "https://api.twitter.com";

/**
 * One authenticated X API v2 call. `path` is under the API root (e.g.
 * `/2/tweets`) ; `query` are URL params folded into the OAuth signature ; `body`
 * is sent as JSON (not part of the OAuth 1.0a signature). Returns the parsed
 * JSON ; throws a readable error (carrying X's `detail` / `title` / first error
 * message) on a non-2xx.
 */
export async function twitterCall(params: {
  credentials: OAuth1Credentials;
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}): Promise<unknown> {
  const baseUrl = `${API_ROOT}${params.path}`;
  const qs = params.query ? new URLSearchParams(params.query).toString() : "";
  const url = qs ? `${baseUrl}?${qs}` : baseUrl;
  const authorization = buildAuthHeader({
    method: params.method,
    baseUrl,
    query: params.query,
    credentials: params.credentials,
  });
  const hasBody = params.body !== undefined && params.body !== null;
  const res = await safeFetch(url, {
    method: params.method,
    headers: {
      Authorization: authorization,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(params.body) } : {}),
    timeoutMs: 15_000,
    maxBytes: 1_000_000,
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    throw new Error(
      `X ${params.method} ${params.path} failed (${res.status}): ${describeError(data, res)}`,
    );
  }
  return data;
}

/** Pull the most useful message out of an X v2 error envelope. */
function describeError(data: unknown, res: { status: number; statusText: string }): string {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (typeof o.detail === "string") return o.detail;
    if (typeof o.title === "string") return o.title;
    if (Array.isArray(o.errors) && o.errors[0] && typeof o.errors[0] === "object") {
      const first = o.errors[0] as Record<string, unknown>;
      if (typeof first.message === "string") return first.message;
      if (typeof first.detail === "string") return first.detail;
    }
  }
  return res.statusText || `HTTP ${res.status}`;
}

/**
 * Resolve the org's four OAuth 1.0a credentials from its secret store via the
 * run context, or throw a clear "not connected" error.
 */
export async function requireCredentials(ctx: NodeExecutionContext): Promise<OAuth1Credentials> {
  const [consumerKey, consumerSecret, accessToken, accessTokenSecret] = await Promise.all([
    ctx.getSecret(TWITTER_CONSUMER_KEY_SECRET),
    ctx.getSecret(TWITTER_CONSUMER_SECRET_SECRET),
    ctx.getSecret(TWITTER_ACCESS_TOKEN_SECRET),
    ctx.getSecret(TWITTER_ACCESS_TOKEN_SECRET_SECRET),
  ]);
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    throw new Error(
      "X (Twitter) is not connected for this organization. Add the API credentials under X settings first.",
    );
  }
  return { consumerKey, consumerSecret, accessToken, accessTokenSecret };
}

export { pickString } from "@monark/integration-kit/server";
