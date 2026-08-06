import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeExecutionContext } from "@monark/automation/server";

// Stub the two network boundaries — `discordRequest` (bot REST) and
// `sendToWebhookUrl` (webhook POST) — while keeping the real output readers, so
// each node executor runs end to end without the network.
vi.mock("../src/server/client", async (importActual) => {
  const actual = await importActual<typeof import("../src/server/client")>();
  return { ...actual, discordRequest: vi.fn(), sendToWebhookUrl: vi.fn(async () => undefined) };
});

import { discordRequest, sendToWebhookUrl } from "../src/server/client";
import { requireChannel, requireSecret } from "../src/server/nodes/shared";
import {
  discordAddReactionNode,
  discordEditMessageNode,
  discordListMessagesNode,
  discordSendMessageNode,
  discordSendWebhookMessageNode,
} from "../src/server/nodes/messages";
import { discordGetChannelNode } from "../src/server/nodes/channel";

const req = vi.mocked(discordRequest);
const webhook = vi.mocked(sendToWebhookUrl);

function makeCtx(secret: string | null = "bot-tok"): NodeExecutionContext {
  return { getSecret: vi.fn(async () => secret) } as unknown as NodeExecutionContext;
}

const call = () => req.mock.calls[0]?.[0] as { method: string; path: string; body?: unknown };

beforeEach(() => {
  req.mockReset();
  webhook.mockReset();
});

describe("discord node helpers", () => {
  it("requireSecret resolves the org secret and rejects a missing / unset one", async () => {
    await expect(requireSecret(makeCtx("v"), "s", "bot token")).resolves.toBe("v");
    await expect(requireSecret(makeCtx(), "", "bot token")).rejects.toThrow(/No bot token/);
    await expect(requireSecret(makeCtx(null), "s", "bot token")).rejects.toThrow(/is not set/);
  });

  it("requireChannel trims a channel id and rejects empty", () => {
    expect(requireChannel(" 123 ")).toBe("123");
    expect(() => requireChannel("  ")).toThrow(/channel ID is required/);
    expect(() => requireChannel(5)).toThrow(/channel ID is required/);
  });
});

describe("discord action nodes", () => {
  it("send-message POSTs the content and maps the message id", async () => {
    req.mockResolvedValue({ id: "msg1" });
    const out = await discordSendMessageNode.run(makeCtx(), {
      token: "s",
      channelId: "123",
      content: "hi",
    });
    expect(call()).toEqual({
      token: "bot-tok",
      method: "POST",
      path: "/channels/123/messages",
      body: { content: "hi" },
    });
    expect(out).toEqual({ messageId: "msg1", channelId: "123" });
  });

  it("send-via-webhook resolves the URL secret and posts through the webhook", async () => {
    const out = await discordSendWebhookMessageNode.run(
      makeCtx("https://discord.com/api/webhooks/1/abc"),
      { webhook: "w", content: "hi", username: "Bot" },
    );
    expect(webhook).toHaveBeenCalledWith("https://discord.com/api/webhooks/1/abc", {
      content: "hi",
      username: "Bot",
    });
    expect(req).not.toHaveBeenCalled();
    expect(out).toEqual({ sent: true });
  });

  it("edit-message PATCHes the message content", async () => {
    req.mockResolvedValue({ id: "m1" });
    const out = await discordEditMessageNode.run(makeCtx(), {
      token: "s",
      channelId: "123",
      messageId: "m1",
      content: "new",
    });
    expect(call().method).toBe("PATCH");
    expect(call().path).toBe("/channels/123/messages/m1");
    expect(call().body).toEqual({ content: "new" });
    expect(out).toEqual({ messageId: "m1" });
  });

  it("add-reaction PUTs the URL-encoded emoji", async () => {
    req.mockResolvedValue({});
    const out = await discordAddReactionNode.run(makeCtx(), {
      token: "s",
      channelId: "123",
      messageId: "m1",
      emoji: "👍",
    });
    expect(call().method).toBe("PUT");
    expect(call().path).toBe(`/channels/123/messages/m1/reactions/${encodeURIComponent("👍")}/@me`);
    expect(out).toEqual({ ok: true });
  });

  it("list-messages clamps the limit and summarises the page", async () => {
    req.mockResolvedValue([
      { id: "m1", content: "hey", author: { username: "al" }, timestamp: "t" },
    ]);
    const out = await discordListMessagesNode.run(makeCtx(), {
      token: "s",
      channelId: "123",
      limit: 9999,
    });
    expect(call().method).toBe("GET");
    expect(call().path).toBe("/channels/123/messages?limit=100"); // clamped to 100
    expect(out).toEqual({
      count: 1,
      messages: [{ id: "m1", content: "hey", author: "al", timestamp: "t" }],
    });
  });

  it("get-channel GETs the channel and maps its metadata", async () => {
    req.mockResolvedValue({ id: "123", name: "general", type: 0, topic: "chat" });
    const out = await discordGetChannelNode.run(makeCtx(), { token: "s", channelId: "123" });
    expect(call().path).toBe("/channels/123");
    expect(out).toEqual({ id: "123", name: "general", type: 0, topic: "chat" });
  });
});
