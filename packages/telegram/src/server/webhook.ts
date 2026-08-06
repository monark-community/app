import { constantTimeEquals, defineInboundWebhook } from "@monark/integration-kit/server";
import { TELEGRAM_WEBHOOK_SECRET_KEY, parseCommand } from "../contracts/telegram";
import type { TelegramEvents } from "../contracts/events";

// ── payload helpers (Telegram Update objects are loosely-typed JSON) ─────────
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

/**
 * Map a raw Telegram Update to one of our domain events, or null for a delivery
 * we don't model. We subscribe to `message` updates only (see the connect
 * flow's `allowed_updates`), and split them : a text starting with `/` becomes a
 * `telegram.command` (parsed), any other text a `telegram.message-received`.
 * Non-text messages (photos, stickers) and edits are acked-and-ignored.
 * `organizationId` is stamped so the automation + webhook subscribers route it.
 */
export function mapTelegramUpdate(
  _eventName: string,
  payload: unknown,
  organizationId: string,
): TelegramEvents | null {
  const update = obj(payload);
  if (!update.message) return null; // ignore edited_message, callback_query, …
  const msg = obj(update.message);
  const text = str(msg.text);
  if (!text) return null; // non-text message (photo, sticker, …)

  const chat = obj(msg.chat);
  const from = obj(msg.from);
  const base = {
    organizationId,
    occurredAt: new Date(),
    chatId: num(chat.id),
    chatType: str(chat.type),
    messageId: num(msg.message_id),
    fromId: num(from.id),
    fromUsername: str(from.username),
    fromFirstName: str(from.first_name),
  };

  const cmd = parseCommand(text);
  if (cmd) {
    return { ...base, type: "telegram.command", command: cmd.command, args: cmd.args };
  }
  return { ...base, type: "telegram.message-received", text };
}

/**
 * Handle one inbound Telegram update: the integration-kit helper resolves the
 * org's stored webhook secret, verifies it against the
 * `X-Telegram-Bot-Api-Secret-Token` header (constant-time equality — Telegram
 * signs nothing over the body), maps the update via {@link mapTelegramUpdate},
 * and emits it (the automation subscriber fires matching flows). Unmodeled
 * updates ack with 202 so Telegram doesn't retry.
 */
export const handleTelegramWebhook = defineInboundWebhook<TelegramEvents>({
  secretKey: TELEGRAM_WEBHOOK_SECRET_KEY,
  verify: (_rawBody, secret, signature) => constantTimeEquals(secret, signature ?? ""),
  map: mapTelegramUpdate,
  label: "telegram",
});
