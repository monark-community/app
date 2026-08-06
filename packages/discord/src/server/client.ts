import { safeFetch } from "@monark/common/http";
import { createRestClient } from "@monark/integration-kit/server";
import { isDiscordWebhookUrl } from "../contracts/discord";

// Discord bot REST over the shared integration client. Discord authenticates a
// bot with `Authorization: Bot <token>` (not a bearer) and requires a
// User-Agent ; both are configured here.
const bot = createRestClient({
  baseUrl: "https://discord.com/api/v10",
  authHeader: (token) => `Bot ${token}`,
  defaultHeaders: { "User-Agent": "Monark-Automation (https://monark.io, 1.0)" },
});

/** One authenticated Discord bot REST call. Returns parsed JSON ; throws on non-2xx. */
export function discordRequest(params: {
  token: string;
  method: string;
  /** Path under the API root, e.g. `/channels/123/messages`. */
  path: string;
  body?: unknown;
}): Promise<unknown> {
  return bot.request(params);
}

/**
 * Post a message to a Discord **channel-webhook URL** (no bot needed — the URL
 * itself carries the credential). The URL is validated to a discord.com webhook
 * (defence-in-depth on top of `safeFetch`'s SSRF guard). Returns nothing useful
 * (Discord answers 204) ; throws on a non-2xx.
 */
export async function sendToWebhookUrl(url: string, body: unknown): Promise<void> {
  if (!isDiscordWebhookUrl(url)) {
    throw new Error("Not a Discord webhook URL (expected https://discord.com/api/webhooks/…).");
  }
  const res = await safeFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Monark-Automation" },
    body: JSON.stringify(body),
    timeoutMs: 15_000,
    maxBytes: 1_000_000,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord webhook POST failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

export { pickString, pickNumber } from "@monark/integration-kit/server";
