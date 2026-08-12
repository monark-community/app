import { afterEach, describe, expect, it, vi } from "vitest";
import type { NodeExecutionContext } from "@monark/automation/server";

// The X (Twitter) API v2 client: the OAuth-1.0a-signed call over the shared
// `safeFetch` (mocked), its error-envelope parsing (detail / title / errors[]),
// and the credential resolver that reads the org's four secrets off the run ctx.
// `buildAuthHeader` (oauth1.ts) runs for real — we only assert the header is an
// OAuth header, its exact signature is covered by oauth1.test.ts.

const { mockSafeFetch } = vi.hoisted(() => ({ mockSafeFetch: vi.fn() }));
vi.mock("@monark/common/http", () => ({
  safeFetch: (...args: unknown[]) => mockSafeFetch(...args),
}));

import { requireCredentials, twitterCall } from "../src/server/client";
import {
  TWITTER_ACCESS_TOKEN_SECRET,
  TWITTER_ACCESS_TOKEN_SECRET_SECRET,
  TWITTER_CONSUMER_KEY_SECRET,
  TWITTER_CONSUMER_SECRET_SECRET,
} from "../src/contracts/twitter";

const CREDS = {
  consumerKey: "ck",
  consumerSecret: "cs",
  accessToken: "at",
  accessTokenSecret: "ats",
};
type FakeRes = { ok: boolean; status: number; statusText: string; text: () => Promise<string> };
const res = (o: Partial<FakeRes> & { body?: string }): FakeRes => ({
  ok: o.ok ?? true,
  status: o.status ?? 200,
  statusText: o.statusText ?? "",
  text: async () => o.body ?? "",
});
const lastCall = () => mockSafeFetch.mock.calls.at(-1) as [string, Record<string, unknown>];

afterEach(() => vi.clearAllMocks());

describe("twitterCall", () => {
  it("signs the request, sends a JSON body, and returns the parsed data", async () => {
    mockSafeFetch.mockResolvedValue(
      res({ body: JSON.stringify({ data: { id: "1", text: "hi" } }) }),
    );
    const out = await twitterCall({
      credentials: CREDS,
      method: "POST",
      path: "/2/tweets",
      body: { text: "hi" },
    });
    expect(out).toEqual({ data: { id: "1", text: "hi" } });
    const [url, opts] = lastCall();
    expect(url).toBe("https://api.twitter.com/2/tweets");
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^OAuth /);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(opts.body).toBe(JSON.stringify({ text: "hi" }));
    expect(opts.timeoutMs).toBe(15_000);
  });

  it("folds query params into the URL and omits the body/content-type when absent", async () => {
    mockSafeFetch.mockResolvedValue(res({ body: "{}" }));
    await twitterCall({
      credentials: CREDS,
      method: "GET",
      path: "/2/users/me",
      query: { "user.fields": "id" },
    });
    const [url, opts] = lastCall();
    expect(url).toBe("https://api.twitter.com/2/users/me?user.fields=id");
    expect(opts).not.toHaveProperty("body");
    expect(opts.headers).not.toHaveProperty("Content-Type");
  });

  it("returns null for an empty body and passes through non-JSON text", async () => {
    mockSafeFetch.mockResolvedValueOnce(res({ body: "" }));
    expect(
      await twitterCall({ credentials: CREDS, method: "DELETE", path: "/2/tweets/1" }),
    ).toBeNull();
    mockSafeFetch.mockResolvedValueOnce(res({ body: "not json" }));
    expect(await twitterCall({ credentials: CREDS, method: "GET", path: "/x" })).toBe("not json");
  });

  it("surfaces the most useful X error message (detail / title / errors[]/ fallback)", async () => {
    const call = () => twitterCall({ credentials: CREDS, method: "POST", path: "/2/tweets" });
    mockSafeFetch.mockResolvedValueOnce(
      res({ ok: false, status: 400, body: JSON.stringify({ detail: "Bad request" }) }),
    );
    await expect(call()).rejects.toThrow(/400.*Bad request/);
    mockSafeFetch.mockResolvedValueOnce(
      res({ ok: false, status: 401, body: JSON.stringify({ title: "Unauthorized" }) }),
    );
    await expect(call()).rejects.toThrow(/401.*Unauthorized/);
    mockSafeFetch.mockResolvedValueOnce(
      res({ ok: false, status: 403, body: JSON.stringify({ errors: [{ message: "duplicate" }] }) }),
    );
    await expect(call()).rejects.toThrow(/403.*duplicate/);
    mockSafeFetch.mockResolvedValueOnce(
      res({ ok: false, status: 500, statusText: "Server Error", body: "" }),
    );
    await expect(call()).rejects.toThrow(/500.*Server Error/);
  });
});

describe("requireCredentials", () => {
  const ctxWith = (secrets: Record<string, string | null>): NodeExecutionContext =>
    ({ getSecret: async (k: string) => secrets[k] ?? null }) as unknown as NodeExecutionContext;

  it("resolves all four OAuth secrets off the run context", async () => {
    const ctx = ctxWith({
      [TWITTER_CONSUMER_KEY_SECRET]: "ck",
      [TWITTER_CONSUMER_SECRET_SECRET]: "cs",
      [TWITTER_ACCESS_TOKEN_SECRET]: "at",
      [TWITTER_ACCESS_TOKEN_SECRET_SECRET]: "ats",
    });
    expect(await requireCredentials(ctx)).toEqual(CREDS);
  });

  it("throws a clear 'not connected' error when any secret is missing", async () => {
    const ctx = ctxWith({
      [TWITTER_CONSUMER_KEY_SECRET]: "ck",
      [TWITTER_CONSUMER_SECRET_SECRET]: "cs",
      [TWITTER_ACCESS_TOKEN_SECRET]: "at",
      // access-token-secret missing
    });
    await expect(requireCredentials(ctx)).rejects.toThrow(/not connected/i);
  });
});
