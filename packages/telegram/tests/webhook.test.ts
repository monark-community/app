import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/contracts/telegram";
import { mapTelegramUpdate } from "../src/server/webhook";

const ORG = "org-1";

describe("parseCommand", () => {
  it("parses a bare command", () => {
    expect(parseCommand("/start")).toEqual({ command: "start", args: "" });
  });
  it("parses a command with args + strips @botname, lower-cases", () => {
    expect(parseCommand("/Deploy@mybot  main  now")).toEqual({
      command: "deploy",
      args: "main  now",
    });
  });
  it("returns null for non-commands", () => {
    expect(parseCommand("hello")).toBeNull();
    expect(parseCommand("  ")).toBeNull();
    expect(parseCommand("/")).toBeNull();
  });
});

describe("mapTelegramUpdate", () => {
  const chat = { id: 42, type: "private" };
  const from = { id: 7, username: "alice", first_name: "Alice" };

  it("maps a plain text message to message-received", () => {
    const e = mapTelegramUpdate(
      "",
      { update_id: 1, message: { message_id: 100, chat, from, text: "hi there" } },
      ORG,
    );
    expect(e).toMatchObject({
      type: "telegram.message-received",
      organizationId: ORG,
      chatId: 42,
      chatType: "private",
      messageId: 100,
      text: "hi there",
      fromId: 7,
      fromUsername: "alice",
      fromFirstName: "Alice",
    });
  });

  it("maps a /command message to command with parsed args", () => {
    const e = mapTelegramUpdate(
      "",
      { update_id: 2, message: { message_id: 101, chat, from, text: "/help me please" } },
      ORG,
    );
    expect(e).toMatchObject({
      type: "telegram.command",
      command: "help",
      args: "me please",
      chatId: 42,
      messageId: 101,
    });
  });

  it("ignores edits, non-message updates, and non-text messages", () => {
    expect(mapTelegramUpdate("", { update_id: 3, edited_message: { text: "x" } }, ORG)).toBeNull();
    expect(mapTelegramUpdate("", { update_id: 4, callback_query: {} }, ORG)).toBeNull();
    expect(
      mapTelegramUpdate("", { update_id: 5, message: { message_id: 1, chat, from } }, ORG),
    ).toBeNull();
  });
});
