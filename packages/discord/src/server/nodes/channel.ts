import { z } from "zod";
import { defineNode } from "@monark/automation/server";
import { discordRequest, pickNumber, pickString } from "../client";
import {
  BOT_TOKEN_FIELD,
  CHANNEL_FIELD,
  DISCORD_CATEGORY,
  DISCORD_ICON,
  requireChannel,
  requireSecret,
} from "./shared";

/** Read a channel's metadata. */
export const discordGetChannelNode = defineNode({
  descriptor: {
    kind: "action",
    category: DISCORD_CATEGORY,
    label: "Discord: Get channel",
    description: "Fetch a channel's name, type, and topic.",
    icon: DISCORD_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "id", type: "string", description: "The channel id." },
      { key: "name", type: "string", description: "The channel name." },
      { key: "type", type: "number", description: "The channel type code." },
      { key: "topic", type: "string", description: "The channel topic." },
    ],
    configFields: [BOT_TOKEN_FIELD, CHANNEL_FIELD],
  },
  configSchema: z.object({
    token: z.string(),
    channelId: z.string(),
  }),
  execute: async (ctx, config) => {
    const token = await requireSecret(ctx, config.token, "bot token");
    const channelId = requireChannel(config.channelId);
    const channel = await discordRequest({
      token,
      method: "GET",
      path: `/channels/${channelId}`,
    });
    return {
      id: pickString(channel, "id"),
      name: pickString(channel, "name"),
      type: pickNumber(channel, "type"),
      topic: pickString(channel, "topic"),
    };
  },
});
