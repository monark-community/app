import { afterEach, describe, expect, it, vi } from "vitest";

// The Discord bot REST wrapper + the channel-webhook-URL sender. `safeFetch` is
// mocked so we exercise both paths (bot call over the kit's client ; the direct
// webhook POST with its discord.com URL guard) without touching the network.

const { mockSafeFetch } = vi.hoisted(() => ({ mockSafeFetch: vi.fn() }));
vi.mock("@monark/common/http", () => ({
  safeFetch: (...args: unknown[]) => mockSafeFetch(...args),
}));

import { discordRequest, sendToWebhookUrl } from "../src/server/client";

type FakeRes = { ok: boolean; status: number; statusText: string; text: () => Promise<string> };
const res = (o: Partial<FakeRes> & { body?: string }): FakeRes => ({
  ok: o.ok ?? true,
  status: o.status ?? 200,
  statusText: o.statusText ?? "",
  text: async () => o.body ?? "",
});

afterEach(() => vi.clearAllMocks());

describe("discordRequest", () => {
  it("makes an authenticated Bot call and returns parsed JSON", async () => {
    mockSafeFetch.mockResolvedValue(res({ body: JSON.stringify({ id: "chan-1" }) }));
    const out = await discordRequest({ token: "tok", method: "GET", path: "/channels/1" });
    expect(out).toEqual({ id: "chan-1" });
    const [url, opts] = mockSafeFetch.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(url).toBe("https://discord.com/api/v10/channels/1");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bot tok");
  });

  it("throws on a non-2xx", async () => {
    mockSafeFetch.mockResolvedValue(
      res({ ok: false, status: 403, body: JSON.stringify({ message: "Missing Access" }) }),
    );
    await expect(
      discordRequest({ token: "t", method: "POST", path: "/channels/1/messages" }),
    ).rejects.toThrow(/403.*Missing Access/);
  });
});

describe("sendToWebhookUrl", () => {
  it("posts JSON to a valid discord.com webhook URL", async () => {
    mockSafeFetch.mockResolvedValue(res({ ok: true, status: 204 }));
    await expect(
      sendToWebhookUrl("https://discord.com/api/webhooks/123/abc", { content: "hi" }),
    ).resolves.toBeUndefined();
    const [url, opts] = mockSafeFetch.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(url).toBe("https://discord.com/api/webhooks/123/abc");
    expect(opts.body).toBe(JSON.stringify({ content: "hi" }));
  });

  it("rejects a non-Discord URL before making any request (SSRF defence-in-depth)", async () => {
    await expect(sendToWebhookUrl("https://evil.example.com/hook", {})).rejects.toThrow(
      /Discord webhook URL/,
    );
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it("throws with the response snippet on a non-2xx", async () => {
    mockSafeFetch.mockResolvedValue(res({ ok: false, status: 400, body: "bad payload" }));
    await expect(sendToWebhookUrl("https://discord.com/api/webhooks/123/abc", {})).rejects.toThrow(
      /400.*bad payload/,
    );
  });
});
