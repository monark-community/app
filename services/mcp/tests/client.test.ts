import { describe, expect, it } from "vitest";
import { MonarkApiError, MonarkClient } from "../src/client";

type Call = { url: string; init: RequestInit | undefined };

function fakeFetch(responder: (url: string) => { ok: boolean; status: number; body: string }): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { ok, status, body } = responder(url);
    return { ok, status, text: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, calls };
}

const config = { apiUrl: "https://host.test", apiKey: "mrk_test" };

describe("MonarkClient", () => {
  it("targets /api/v1, sends the bearer key, and parses JSON", async () => {
    const { fetch, calls } = fakeFetch(() => ({ ok: true, status: 200, body: '{"userId":"u1"}' }));
    const client = new MonarkClient(config, fetch);
    const result = await client.request("GET", "/me");

    expect(result).toEqual({ userId: "u1" });
    expect(calls[0]?.url).toBe("https://host.test/api/v1/me");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer mrk_test");
  });

  it("appends defined query params and skips undefined ones", async () => {
    const { fetch, calls } = fakeFetch(() => ({ ok: true, status: 200, body: '{"items":[]}' }));
    const client = new MonarkClient(config, fetch);
    await client.request("GET", "/models/widgets/records", {
      query: { search: "abc", limit: 10, cursor: undefined },
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v1/models/widgets/records");
    expect(url.searchParams.get("search")).toBe("abc");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.has("cursor")).toBe(false);
  });

  it("sends a JSON body + Content-Type on writes", async () => {
    const { fetch, calls } = fakeFetch(() => ({ ok: true, status: 200, body: '{"id":"r1"}' }));
    const client = new MonarkClient(config, fetch);
    await client.request("POST", "/models/widgets/records", { body: { data: { title: "x" } } });
    const init = calls[0]!.init!;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ data: { title: "x" } });
  });

  it("maps a non-2xx error body to MonarkApiError", async () => {
    const { fetch } = fakeFetch(() => ({
      ok: false,
      status: 403,
      body: '{"error":{"code":"forbidden","message":"nope"}}',
    }));
    const client = new MonarkClient(config, fetch);
    await expect(
      client.request("POST", "/models/widgets/records", { body: {} }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden", message: "nope" });
    await expect(client.request("POST", "/x", { body: {} })).rejects.toBeInstanceOf(MonarkApiError);
  });

  it("returns null for an empty (204) body", async () => {
    const { fetch } = fakeFetch(() => ({ ok: true, status: 204, body: "" }));
    const client = new MonarkClient(config, fetch);
    expect(await client.request("DELETE", "/records/r1")).toBeNull();
  });
});
