/**
 * Shared Discord constants + validators. The MVP is write-only (send messages,
 * react, read a channel) via a bot token or a channel webhook URL — Discord has
 * no inbound event webhooks (those come over the Gateway WebSocket), so there
 * are no domain events here.
 */

/** A Discord channel-webhook URL: `https://discord.com/api/webhooks/<id>/<token>`. */
export function isDiscordWebhookUrl(value: string): boolean {
  return /^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/.test(value.trim());
}
