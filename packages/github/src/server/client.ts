import { safeFetch } from "@monark/common/http";

const GITHUB_API = "https://api.github.com";
const API_VERSION = "2022-11-28";
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 2_000_000;

/**
 * One GitHub REST call, authenticated with a bearer token, through the shared
 * `safeFetch` (SSRF-guarded, size-capped — `api.github.com` is public so it
 * passes). Returns the parsed JSON body (or null for an empty 204) ; throws a
 * readable error on a non-2xx so the automation engine records the node's step
 * as failed with GitHub's message.
 */
export async function githubRequest(params: {
  token: string;
  method: string;
  /** Path under the API root, e.g. `/repos/octo/hello/issues`. */
  path: string;
  body?: unknown;
}): Promise<unknown> {
  const { token, method, path, body } = params;
  const hasBody = body !== undefined && body !== null;
  const res = await safeFetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "Monark-Automation",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_BYTES,
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text; // non-JSON body (rare) — keep the raw text for the error
    }
  }

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : res.statusText || `HTTP ${res.status}`;
    throw new Error(`GitHub ${method} ${path} failed (${res.status}): ${message}`);
  }
  return data;
}

/** Read a string field off an unknown GitHub object (defensive vs. shape drift). */
export function pickString(obj: unknown, key: string): string {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
  }
  return "";
}

/** Read a numeric field off an unknown GitHub object. */
export function pickNumber(obj: unknown, key: string): number {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "number") return v;
  }
  return 0;
}
