import { z } from "zod";
import { defineNode } from "@monark/automation/server";
import { discordRequest, pickString, sendToWebhookUrl } from "../client";
import {
  BOT_TOKEN_FIELD,
  CHANNEL_FIELD,
  DISCORD_CATEGORY,
  DISCORD_ICON,
  WEBHOOK_URL_FIELD,
  requireChannel,
  requireSecret,
} from "./shared";

/** Send a message to a channel via a bot token. */
export const discordSendMessageNode = defineNode({
  descriptor: {
    kind: "action",
    category: DISCORD_CATEGORY,
    label: "Discord: Send message",
    description: "Post a message to a channel using a bot token.",
    icon: DISCORD_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "messageId", type: "string", description: "The sent message's id." },
      { key: "channelId", type: "string", description: "The channel it was sent to." },
    ],
    configFields: [
      BOT_TOKEN_FIELD,
      CHANNEL_FIELD,
      { key: "content", label: "Message", type: "textarea", required: true },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    channelId: z.string(),
    content: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const token = await requireSecret(ctx, config.token, "bot token");
    const channelId = requireChannel(config.channelId);
    const message = await discordRequest({
      token,
      method: "POST",
      path: `/channels/${channelId}/messages`,
      body: { content: String(config.content ?? "") },
    });
    return { messageId: pickString(message, "id"), channelId };
  },
});

/** Send a message via a channel webhook URL (no bot). */
export const discordSendWebhookMessageNode = defineNode({
  descriptor: {
    kind: "action",
    category: DISCORD_CATEGORY,
    label: "Discord: Send via webhook",
    description: "Post a message to a channel webhook URL (no bot needed).",
    icon: DISCORD_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [{ key: "sent", type: "boolean", description: "Whether the message was sent." }],
    configFields: [
      WEBHOOK_URL_FIELD,
      { key: "content", label: "Message", type: "textarea", required: true },
      { key: "username", label: "Override username", type: "text" },
    ],
  },
  configSchema: z.object({
    webhook: z.string(),
    content: z.unknown().optional(),
    username: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const url = await requireSecret(ctx, config.webhook, "webhook URL");
    const username =
      typeof config.username === "string" && config.username.trim() ? config.username : undefined;
    await sendToWebhookUrl(url, {
      content: String(config.content ?? ""),
      ...(username ? { username } : {}),
    });
    return { sent: true };
  },
});

/** Edit a message the bot can edit (its own). */
export const discordEditMessageNode = defineNode({
  descriptor: {
    kind: "action",
    category: DISCORD_CATEGORY,
    label: "Discord: Edit message",
    description: "Edit a message's content (bot messages only).",
    icon: DISCORD_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [{ key: "messageId", type: "string", description: "The edited message's id." }],
    configFields: [
      BOT_TOKEN_FIELD,
      CHANNEL_FIELD,
      { key: "messageId", label: "Message ID", type: "text", required: true },
      { key: "content", label: "New content", type: "textarea", required: true },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    channelId: z.string(),
    messageId: z.string(),
    content: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const token = await requireSecret(ctx, config.token, "bot token");
    const channelId = requireChannel(config.channelId);
    const message = await discordRequest({
      token,
      method: "PATCH",
      path: `/channels/${channelId}/messages/${config.messageId}`,
      body: { content: String(config.content ?? "") },
    });
    return { messageId: pickString(message, "id") };
  },
});

/** Add a reaction to a message. */
export const discordAddReactionNode = defineNode({
  descriptor: {
    kind: "action",
    category: DISCORD_CATEGORY,
    label: "Discord: Add reaction",
    description: "React to a message with an emoji.",
    icon: DISCORD_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [{ key: "ok", type: "boolean", description: "Whether the reaction was added." }],
    configFields: [
      BOT_TOKEN_FIELD,
      CHANNEL_FIELD,
      { key: "messageId", label: "Message ID", type: "text", required: true },
      {
        key: "emoji",
        label: "Emoji",
        type: "text",
        required: true,
        help: "A unicode emoji (👍) or a custom emoji as name:id.",
      },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    channelId: z.string(),
    messageId: z.string(),
    emoji: z.string(),
  }),
  execute: async (ctx, config) => {
    const token = await requireSecret(ctx, config.token, "bot token");
    const channelId = requireChannel(config.channelId);
    const emoji = encodeURIComponent(String(config.emoji ?? "").trim());
    await discordRequest({
      token,
      method: "PUT",
      path: `/channels/${channelId}/messages/${config.messageId}/reactions/${emoji}/@me`,
    });
    return { ok: true };
  },
});

/** List recent messages in a channel. */
export const discordListMessagesNode = defineNode({
  descriptor: {
    kind: "action",
    category: DISCORD_CATEGORY,
    label: "Discord: List messages",
    description: "Read recent messages from a channel.",
    icon: DISCORD_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "count", type: "number", description: "How many messages were returned." },
      { key: "messages", type: "object", description: "The messages (id, content, author)." },
    ],
    configFields: [
      BOT_TOKEN_FIELD,
      CHANNEL_FIELD,
      { key: "limit", label: "Max results", type: "number", placeholder: "20" },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    channelId: z.string(),
    limit: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const token = await requireSecret(ctx, config.token, "bot token");
    const channelId = requireChannel(config.channelId);
    const n = typeof config.limit === "number" ? config.limit : Number(config.limit);
    const limit = Number.isFinite(n) ? Math.min(100, Math.max(1, Math.trunc(n))) : 20;
    const result = await discordRequest({
      token,
      method: "GET",
      path: `/channels/${channelId}/messages?limit=${limit}`,
    });
    const messages = Array.isArray(result) ? result : [];
    return {
      count: messages.length,
      messages: messages.map((m) => {
        const obj = m && typeof m === "object" ? (m as Record<string, unknown>) : {};
        return {
          id: pickString(m, "id"),
          content: pickString(m, "content"),
          author: pickString(obj.author, "username"),
          timestamp: pickString(m, "timestamp"),
        };
      }),
    };
  },
});
