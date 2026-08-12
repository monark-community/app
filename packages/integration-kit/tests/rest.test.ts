import { afterEach, describe, expect, it, vi } from "vitest";

// The shared token-auth JSON REST client every integration's API wrapper reuses.
// `safeFetch` (the SSRF-guarded fetch) is mocked so we can drive the request
// shaping (auth header variants, body / content-type, defaults) and the
// response handling (JSON / empty-204 / non-JSON / error-message extraction).

const { mockSafeFetch } = vi.hoisted(() => ({ mockSafeFetch: vi.fn() }));
vi.mock("@monark/common/http", () => ({
  safeFetch: (...args: unknown[]) => mockSafeFetch(...args),
}));

import { createRestClient, pickNumber, pickString } from "../src/server/rest";

type FakeRes = { ok: boolean; status: number; statusText: string; text: () => Promise<string> };
const res = (o: Partial<FakeRes> & { body?: string }): FakeRes => ({
  ok: o.ok ?? true,
  status: o.status ?? 200,
  statusText: o.statusText ?? "",
  text: async () => o.body ?? "",
});
const lastCall = () => mockSafeFetch.mock.calls.at(-1)!;

afterEach(() => vi.clearAllMocks());

describe("createRestClient — request shaping", () => {
  const client = createRestClient({ baseUrl: "https://api.example.com" });

  it("sends a default Bearer auth header, no body, and the shared timeout/limit", async () => {
    mockSafeFetch.mockResolvedValue(res({ body: JSON.stringify({ id: 1 }) }));
    const out = await client.request({ token: "tok", method: "GET", path: "/things" });
    expect(out).toEqual({ id: 1 });
    const [url, opts] = lastCall() as [string, Record<string, unknown>];
    expect(url).toBe("https://api.example.com/things");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(opts.headers).not.toHaveProperty("Content-Type");
    expect(opts).toMatchObject({ method: "GET", timeoutMs: 15_000, maxBytes: 2_000_000 });
    expect(opts).not.toHaveProperty("body");
  });

  it("serialises a JSON body and sets Content-Type", async () => {
    mockSafeFetch.mockResolvedValue(res({ body: "{}" }));
    await client.request({ token: "t", method: "POST", path: "/x", body: { a: 1 } });
    const [, opts] = lastCall() as [string, Record<string, unknown>];
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(opts.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("honors a custom auth scheme and a no-auth header", async () => {
    mockSafeFetch.mockResolvedValue(res({ body: "{}" }));
    const bot = createRestClient({ baseUrl: "https://x", authHeader: (t) => `Bot ${t}` });
    await bot.request({ token: "abc", method: "GET", path: "/" });
    expect((lastCall()[1] as { headers: Record<string, string> }).headers.Authorization).toBe(
      "Bot abc",
    );

    const noAuth = createRestClient({ baseUrl: "https://x", authHeader: () => null });
    await noAuth.request({ token: "abc", method: "GET", path: "/" });
    expect((lastCall()[1] as { headers: Record<string, string> }).headers).not.toHaveProperty(
      "Authorization",
    );
  });

  it("merges default headers with per-request headers", async () => {
    mockSafeFetch.mockResolvedValue(res({ body: "{}" }));
    const c = createRestClient({
      baseUrl: "https://x",
      defaultHeaders: { Accept: "application/json", "User-Agent": "monark" },
      timeoutMs: 5_000,
      maxBytes: 100,
    });
    await c.request({ token: "t", method: "GET", path: "/", headers: { "X-Extra": "1" } });
    const [, opts] = lastCall() as [string, Record<string, unknown>];
    expect(opts.headers).toMatchObject({ Accept: "application/json", "X-Extra": "1" });
    expect(opts).toMatchObject({ timeoutMs: 5_000, maxBytes: 100 });
  });
});

describe("createRestClient — response handling", () => {
  const client = createRestClient({ baseUrl: "https://x" });

  it("returns null for an empty (204) body and passes through non-JSON text", async () => {
    mockSafeFetch.mockResolvedValueOnce(res({ status: 204, body: "" }));
    expect(await client.request({ token: "t", method: "DELETE", path: "/x" })).toBeNull();
    mockSafeFetch.mockResolvedValueOnce(res({ body: "plain text" }));
    expect(await client.request({ token: "t", method: "GET", path: "/x" })).toBe("plain text");
  });

  it("throws with the provider's message on a non-2xx", async () => {
    mockSafeFetch.mockResolvedValue(
      res({ ok: false, status: 422, body: JSON.stringify({ message: "Validation failed" }) }),
    );
    await expect(client.request({ token: "t", method: "POST", path: "/x" })).rejects.toThrow(
      /422.*Validation failed/,
    );
  });

  it("falls back to statusText, then to HTTP <status>, when there's no message", async () => {
    mockSafeFetch.mockResolvedValueOnce(
      res({ ok: false, status: 500, statusText: "Server Error" }),
    );
    await expect(client.request({ token: "t", method: "GET", path: "/x" })).rejects.toThrow(
      /500.*Server Error/,
    );
    mockSafeFetch.mockResolvedValueOnce(res({ ok: false, status: 503, statusText: "" }));
    await expect(client.request({ token: "t", method: "GET", path: "/x" })).rejects.toThrow(
      /503.*HTTP 503/,
    );
  });
});

describe("pickString / pickNumber", () => {
  it("pickString reads strings, coerces numbers, and defaults to empty", () => {
    expect(pickString({ a: "hi" }, "a")).toBe("hi");
    expect(pickString({ a: 42 }, "a")).toBe("42");
    expect(pickString({ a: true }, "a")).toBe("");
    expect(pickString({}, "a")).toBe("");
    expect(pickString(null, "a")).toBe("");
  });

  it("pickNumber reads numbers and defaults to zero", () => {
    expect(pickNumber({ a: 42 }, "a")).toBe(42);
    expect(pickNumber({ a: "42" }, "a")).toBe(0);
    expect(pickNumber({}, "a")).toBe(0);
    expect(pickNumber(null, "a")).toBe(0);
  });
});
