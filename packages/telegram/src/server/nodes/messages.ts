import { z } from "zod";
import { defineNode } from "@monark/automation/server";
import { pickNumber, pickString, telegramCall } from "../client";
import {
  CHAT_ID_FIELD,
  PARSE_MODE_FIELD,
  TELEGRAM_CATEGORY,
  TELEGRAM_ICON,
  parseModeParam,
  requireBotToken,
  requireChatId,
} from "./shared";

/** Send a text message to a chat. */
export const telegramSendMessageNode = defineNode({
  descriptor: {
    kind: "action",
    category: TELEGRAM_CATEGORY,
    label: "Telegram: Send message",
    description: "Send a text message to a chat via the connected bot.",
    icon: TELEGRAM_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "messageId", type: "number", description: "The sent message's id." },
      { key: "chatId", type: "string", description: "The chat it was sent to." },
    ],
    configFields: [
      CHAT_ID_FIELD,
      { key: "text", label: "Message", type: "textarea", required: true },
      PARSE_MODE_FIELD,
      { key: "disableNotification", label: "Send silently", type: "boolean" },
    ],
  },
  configSchema: z.object({
    chatId: z.string(),
    text: z.unknown().optional(),
    parseMode: z.unknown().optional(),
    disableNotification: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const token = await requireBotToken(ctx);
    const chatId = requireChatId(config.chatId);
    const parseMode = parseModeParam(config.parseMode);
    const message = await telegramCall(token, "sendMessage", {
      chat_id: chatId,
      text: String(config.text ?? ""),
      ...(parseMode ? { parse_mode: parseMode } : {}),
      ...(config.disableNotification === true ? { disable_notification: true } : {}),
    });
    return { messageId: pickNumber(message, "message_id"), chatId };
  },
});

/** Edit the text of a message the bot sent. */
export const telegramEditMessageNode = defineNode({
  descriptor: {
    kind: "action",
    category: TELEGRAM_CATEGORY,
    label: "Telegram: Edit message",
    description: "Replace the text of a message the bot sent.",
    icon: TELEGRAM_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [{ key: "messageId", type: "number", description: "The edited message's id." }],
    configFields: [
      CHAT_ID_FIELD,
      { key: "messageId", label: "Message ID", type: "number", required: true },
      { key: "text", label: "New text", type: "textarea", required: true },
      PARSE_MODE_FIELD,
    ],
  },
  configSchema: z.object({
    chatId: z.string(),
    messageId: z.coerce.number(),
    text: z.unknown().optional(),
    parseMode: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const token = await requireBotToken(ctx);
    const chatId = requireChatId(config.chatId);
    const parseMode = parseModeParam(config.parseMode);
    const message = await telegramCall(token, "editMessageText", {
      chat_id: chatId,
      message_id: config.messageId,
      text: String(config.text ?? ""),
      ...(parseMode ? { parse_mode: parseMode } : {}),
    });
    // editMessageText returns the edited Message (or `true` for inline messages).
    return { messageId: pickNumber(message, "message_id") || config.messageId };
  },
});

/** Delete a message. */
export const telegramDeleteMessageNode = defineNode({
  descriptor: {
    kind: "action",
    category: TELEGRAM_CATEGORY,
    label: "Telegram: Delete message",
    description: "Delete a message from a chat.",
    icon: TELEGRAM_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [{ key: "ok", type: "boolean", description: "Whether the message was deleted." }],
    configFields: [
      CHAT_ID_FIELD,
      { key: "messageId", label: "Message ID", type: "number", required: true },
    ],
  },
  configSchema: z.object({
    chatId: z.string(),
    messageId: z.coerce.number(),
  }),
  execute: async (ctx, config) => {
    const token = await requireBotToken(ctx);
    const chatId = requireChatId(config.chatId);
    const result = await telegramCall(token, "deleteMessage", {
      chat_id: chatId,
      message_id: config.messageId,
    });
    return { ok: result === true };
  },
});

/** Send a photo (by URL) to a chat. */
export const telegramSendPhotoNode = defineNode({
  descriptor: {
    kind: "action",
    category: TELEGRAM_CATEGORY,
    label: "Telegram: Send photo",
    description: "Send a photo (by URL) to a chat, with an optional caption.",
    icon: TELEGRAM_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "messageId", type: "number", description: "The sent message's id." },
      { key: "chatId", type: "string", description: "The chat it was sent to." },
    ],
    configFields: [
      CHAT_ID_FIELD,
      {
        key: "photo",
        label: "Photo URL",
        type: "text",
        required: true,
        placeholder: "https://…/image.jpg",
      },
      { key: "caption", label: "Caption", type: "textarea" },
      PARSE_MODE_FIELD,
    ],
  },
  configSchema: z.object({
    chatId: z.string(),
    photo: z.string(),
    caption: z.unknown().optional(),
    parseMode: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const token = await requireBotToken(ctx);
    const chatId = requireChatId(config.chatId);
    const photo = config.photo.trim();
    if (!photo) throw new Error("A photo URL is required.");
    const caption = typeof config.caption === "string" ? config.caption : "";
    const parseMode = parseModeParam(config.parseMode);
    const message = await telegramCall(token, "sendPhoto", {
      chat_id: chatId,
      photo,
      ...(caption ? { caption } : {}),
      ...(caption && parseMode ? { parse_mode: parseMode } : {}),
    });
    return { messageId: pickNumber(message, "message_id"), chatId };
  },
});

/** Read a chat's metadata. */
export const telegramGetChatNode = defineNode({
  descriptor: {
    kind: "action",
    category: TELEGRAM_CATEGORY,
    label: "Telegram: Get chat",
    description: "Fetch a chat's metadata (title, type, username).",
    icon: TELEGRAM_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "id", type: "number", description: "The chat id." },
      { key: "type", type: "string", description: "private | group | supergroup | channel." },
      { key: "title", type: "string", description: "The chat title (groups / channels)." },
      { key: "username", type: "string", description: "The chat @username, if any." },
    ],
    configFields: [CHAT_ID_FIELD],
  },
  configSchema: z.object({ chatId: z.string() }),
  execute: async (ctx, config) => {
    const token = await requireBotToken(ctx);
    const chatId = requireChatId(config.chatId);
    const chat = await telegramCall(token, "getChat", { chat_id: chatId });
    return {
      id: pickNumber(chat, "id"),
      type: pickString(chat, "type"),
      title: pickString(chat, "title"),
      username: pickString(chat, "username"),
    };
  },
});
