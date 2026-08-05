import { safeFetch } from "@monark/common/http";

/**
 * A tiny token-authenticated JSON REST client over the shared SSRF-guarded
 * `safeFetch` — the shape every integration's API wrapper repeats. Returns the
 * parsed JSON body (null for an empty 204) ; throws a readable error on a
 * non-2xx (carrying the provider's `message` when present) so the automation
 * engine records the node's step as failed with the reason.
 */
export function createRestClient(config: {
  /** API root, e.g. `https://api.github.com`. */
  baseUrl: string;
  /** Headers sent on every request (Accept, API version, User-Agent, …). */
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
}) {
  return {
    request: async (params: {
      token: string;
      method: string;
      /** Path under `baseUrl`, e.g. `/repos/octo/hello/issues`. */
      path: string;
      body?: unknown;
      headers?: Record<string, string>;
    }): Promise<unknown> => {
      const hasBody = params.body !== undefined && params.body !== null;
      const res = await safeFetch(`${config.baseUrl}${params.path}`, {
        method: params.method,
        headers: {
          Authorization: `Bearer ${params.token}`,
          ...(config.defaultHeaders ?? {}),
          ...(params.headers ?? {}),
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
        },
        ...(hasBody ? { body: JSON.stringify(params.body) } : {}),
        timeoutMs: config.timeoutMs ?? 15_000,
        maxBytes: config.maxBytes ?? 2_000_000,
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
        const message =
          data && typeof data === "object" && "message" in data
            ? String((data as { message: unknown }).message)
            : res.statusText || `HTTP ${res.status}`;
        throw new Error(`${params.method} ${params.path} failed (${res.status}): ${message}`);
      }
      return data;
    },
  };
}

/** Read a string (or number-as-string) field off an unknown API object. */
export function pickString(obj: unknown, key: string): string {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
  }
  return "";
}

/** Read a numeric field off an unknown API object. */
export function pickNumber(obj: unknown, key: string): number {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "number") return v;
  }
  return 0;
}
