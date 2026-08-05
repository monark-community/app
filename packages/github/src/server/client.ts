import { createRestClient } from "@monark/integration-kit/server";

// GitHub REST over the shared integration client (SSRF-guarded, size-capped ;
// `api.github.com` is public so it passes). Public API + version pinned here.
const client = createRestClient({
  baseUrl: "https://api.github.com",
  defaultHeaders: {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Monark-Automation",
  },
});

/** One authenticated GitHub REST call. Returns parsed JSON ; throws on a non-2xx. */
export function githubRequest(params: {
  token: string;
  method: string;
  /** Path under the API root, e.g. `/repos/octo/hello/issues`. */
  path: string;
  body?: unknown;
}): Promise<unknown> {
  return client.request(params);
}

// Loosely-typed JSON readers, re-exported so the nodes import them from here.
export { pickString, pickNumber } from "@monark/integration-kit/server";
