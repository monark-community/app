import type { NodeExecutionContext } from "@monark/automation/server";

export const DISCORD_ICON = "Discord";
export const DISCORD_CATEGORY = "discord";

/** A `secret` config field holding the bot token, shared by bot-auth nodes. */
export const BOT_TOKEN_FIELD = {
  key: "token",
  label: "Bot token secret",
  type: "secret",
  required: true,
  help: "A secret holding a Discord bot token (the bot must be in the server / have access to the channel).",
} as const;

/** A `secret` config field holding a channel-webhook URL (no bot needed). */
export const WEBHOOK_URL_FIELD = {
  key: "webhook",
  label: "Webhook URL secret",
  type: "secret",
  required: true,
  help: "A secret holding a Discord channel webhook URL (Channel → Integrations → Webhooks).",
} as const;

export const CHANNEL_FIELD = {
  key: "channelId",
  label: "Channel ID",
  type: "text",
  required: true,
  placeholder: "123456789012345678",
} as const;

/** Resolve a secret's value from the run's org store, or throw a clear error. */
export async function requireSecret(
  ctx: NodeExecutionContext,
  secretName: unknown,
  what: string,
): Promise<string> {
  if (typeof secretName !== "string" || secretName.trim() === "") {
    throw new Error(`No ${what} selected for this Discord node.`);
  }
  const value = await ctx.getSecret(secretName);
  if (!value) throw new Error(`Discord ${what} "${secretName}" is not set for this org.`);
  return value;
}

/** Non-empty channel id (a Discord snowflake) as a string, or throw. */
export function requireChannel(channelId: unknown): string {
  const id = typeof channelId === "string" ? channelId.trim() : "";
  if (!id) throw new Error("A channel ID is required.");
  return id;
}
