/**
 * Shared Telegram-module constants + small helpers, safe for both client and
 * server. Event *payload* shapes live in [events.ts](./events.ts) ; this is the
 * connection-level plumbing (secret key names, event-type strings, the /command
 * parser).
 *
 * Two org secrets back a Telegram connection (both in the `@monark/secrets`
 * substrate) :
 *  - {@link TELEGRAM_BOT_TOKEN_KEY} — the BotFather token. Unlike GitHub /
 *    Discord (where each node names its own token secret), Telegram stores one
 *    canonical bot token per org : the connect flow writes it, the nodes read
 *    it, and it authenticates outbound calls (the token rides in the API URL
 *    path — Telegram's auth model, no Authorization header).
 *  - {@link TELEGRAM_WEBHOOK_SECRET_KEY} — the secret Telegram echoes back in
 *    `X-Telegram-Bot-Api-Secret-Token` on every inbound update ; the inbound
 *    handler compares it in constant time (Telegram signs nothing over the
 *    body, so this is the whole authentication).
 */

/** Org secret holding the BotFather bot token (also used by outbound nodes). */
export const TELEGRAM_BOT_TOKEN_KEY = "telegram.bot-token";

/** Org secret holding the inbound webhook secret (`X-Telegram-Bot-Api-Secret-Token`). */
export const TELEGRAM_WEBHOOK_SECRET_KEY = "telegram.webhook-secret";

/** Fully-qualified domain-event type strings this module emits (trigger sources). */
export const TELEGRAM_EVENT_TYPES = {
  messageReceived: "telegram.message-received",
  command: "telegram.command",
} as const;

/**
 * Parse a Telegram message text into a `/command` + trailing args, or null when
 * it isn't a command. Strips the leading slash and any `@botname` suffix
 * (Telegram appends `@yourbot` to commands sent in groups), and lower-cases the
 * command so `/Start` and `/start` match the same trigger.
 */
export function parseCommand(text: string): { command: string; args: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const spaceIdx = trimmed.search(/\s/);
  const head = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();
  const command = (head.slice(1).split("@")[0] ?? "").toLowerCase();
  if (!command) return null;
  return { command, args };
}
