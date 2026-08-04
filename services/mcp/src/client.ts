import type { MonarkConfig } from "./config";

// A thin HTTP client for the Monark public REST API (/api/v1). The MCP server is
// deliberately a *client* of the same surface a `curl` user hits — so all auth,
// RBAC, the per-key permission ceiling, rate limits, and service-account rules
// are enforced server-side exactly once, and this stays a dumb adapter.

export class MonarkApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MonarkApiError";
  }
}

export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
}

export class MonarkClient {
  private readonly base: string;

  constructor(
    private readonly config: MonarkConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base = `${config.apiUrl}/api/v1`;
  }

  async request<T = unknown>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const url = new URL(`${this.base}${path}`);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const hasBody = opts.body !== undefined;
    const res = await this.fetchImpl(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        // Non-JSON body (a proxy error page, etc.) — surface it as-is on failure.
        if (!res.ok) throw new MonarkApiError(res.status, "non_json", text.slice(0, 500));
      }
    }

    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
      throw new MonarkApiError(
        res.status,
        err?.code ?? "error",
        err?.message ?? `Request failed with HTTP ${res.status}`,
      );
    }
    return json as T;
  }
}
