import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeExecutionContext } from "@monark/automation/server";

// Stub the network boundary — `telegramCall` — while keeping the real
// `pickString` / `pickNumber`, so each node executor runs end to end (token
// resolve → chat-id → request params → output mapping) with no network.
vi.mock("../src/server/client", async (importActual) => {
  const actual = await importActual<typeof import("../src/server/client")>();
  return { ...actual, telegramCall: vi.fn() };
});

import { telegramCall } from "../src/server/client";
import {
  parseModeParam,
  requireBotToken,
  requireChatId,
} from "../src/server/nodes/shared";
import {
  telegramDeleteMessageNode,
  telegramEditMessageNode,
  telegramGetChatNode,
  telegramSendMessageNode,
  telegramSendPhotoNode,
} from "../src/server/nodes/messages";

const call = vi.mocked(telegramCall);

function makeCtx(token: string | null = "bot-tok"): NodeExecutionContext {
  return { getSecret: vi.fn(async () => token) } as unknown as NodeExecutionContext;
}

// (token, method, body) the executor invoked telegramCall with.
const args = () => call.mock.calls[0] as [string, string, Record<string, unknown>];

beforeEach(() => call.mockReset());

describe("telegram node helpers", () => {
  it("requireBotToken resolves the connected token or throws 'not connected'", async () => {
    await expect(requireBotToken(makeCtx("t"))).resolves.toBe("t");
    await expect(requireBotToken(makeCtx(null))).rejects.toThrow(/not connected/i);
  });

  it("requireChatId accepts a numeric id or @username, rejects empty", () => {
    expect(requireChatId("123")).toBe("123");
    expect(requireChatId(123)).toBe("123");
    expect(requireChatId("@chan")).toBe("@chan");
    expect(() => requireChatId("  ")).toThrow(/chat ID is required/);
    expect(() => requireChatId(null)).toThrow(/chat ID is required/);
  });

  it("parseModeParam only passes through Markdown / HTML", () => {
    expect(parseModeParam("Markdown")).toBe("Markdown");
    expect(parseModeParam("HTML")).toBe("HTML");
    expect(parseModeParam("none")).toBeUndefined();
    expect(parseModeParam(undefined)).toBeUndefined();
  });
});

describe("telegram action nodes", () => {
  it("send-message passes text + parse_mode + silent flag and maps the id", async () => {
    call.mockResolvedValue({ message_id: 42 });
    const out = await telegramSendMessageNode.run(makeCtx(), {
      chatId: "123",
      text: "hi",
      parseMode: "Markdown",
      disableNotification: true,
    });
    expect(args()).toEqual([
      "bot-tok",
      "sendMessage",
      { chat_id: "123", text: "hi", parse_mode: "Markdown", disable_notification: true },
    ]);
    expect(out).toEqual({ messageId: 42, chatId: "123" });
  });

  it("edit-message calls editMessageText and falls back to the input id", async () => {
    call.mockResolvedValue(true); // inline edits return `true`, not a Message
    const out = await telegramEditMessageNode.run(makeCtx(), {
      chatId: "123",
      messageId: 7,
      text: "new",
    });
    expect(args()[1]).toBe("editMessageText");
    expect(args()[2]).toMatchObject({ chat_id: "123", message_id: 7, text: "new" });
    expect(out).toEqual({ messageId: 7 });
  });

  it("delete-message reports ok from a boolean result", async () => {
    call.mockResolvedValue(true);
    const out = await telegramDeleteMessageNode.run(makeCtx(), { chatId: "123", messageId: 7 });
    expect(args()).toEqual(["bot-tok", "deleteMessage", { chat_id: "123", message_id: 7 }]);
    expect(out).toEqual({ ok: true });
  });

  it("send-photo passes the URL + caption and rejects an empty URL", async () => {
    call.mockResolvedValue({ message_id: 9 });
    const out = await telegramSendPhotoNode.run(makeCtx(), {
      chatId: "123",
      photo: "https://x/p.jpg",
      caption: "cap",
      parseMode: "HTML",
    });
    expect(args()[1]).toBe("sendPhoto");
    expect(args()[2]).toEqual({
      chat_id: "123",
      photo: "https://x/p.jpg",
      caption: "cap",
      parse_mode: "HTML",
    });
    expect(out).toEqual({ messageId: 9, chatId: "123" });

    await expect(
      telegramSendPhotoNode.run(makeCtx(), { chatId: "123", photo: "   " }),
    ).rejects.toThrow(/photo URL is required/);
  });

  it("get-chat calls getChat and maps the metadata", async () => {
    call.mockResolvedValue({ id: 5, type: "group", title: "Team", username: "teamchat" });
    const out = await telegramGetChatNode.run(makeCtx(), { chatId: "123" });
    expect(args()).toEqual(["bot-tok", "getChat", { chat_id: "123" }]);
    expect(out).toEqual({ id: 5, type: "group", title: "Team", username: "teamchat" });
  });
});
