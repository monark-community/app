import { safeFetch } from "@monark/common/http";

// Telegram Bot API over the shared SSRF-guarded `safeFetch`. Telegram doesn't
// fit the integration-kit's `createRestClient` (header-bearer JSON): the bot
// token rides in the URL *path* (no Authorization header), and every response
// is a `{ ok, result, description }` envelope rather than the bare body — so we
// unwrap `result` and surface Telegram's `description` on failure here. We still
// lean on the kit for the loosely-typed readers (`pickString` / `pickNumber`)
// and the inbound webhook + constant-time verify.

const API_ROOT = "https://api.telegram.org";

/**
 * One Telegram Bot API call. `token` is the BotFather token (goes in the path),
 * `method` a Bot API method (`sendMessage`, `setWebhook`, …), `body` its JSON
 * params. Returns the unwrapped `result` ; throws a readable error (carrying
 * Telegram's `description`) on a non-2xx or `ok: false`, so the automation
 * engine records the node's step as failed with the reason.
 */
export async function telegramCall(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  if (typeof token !== "string" || token.trim() === "") {
    throw new Error("A Telegram bot token is required.");
  }
  const hasBody = body !== undefined;
  const res = await safeFetch(`${API_ROOT}/bot${token}/${method}`, {
    method: "POST",
    headers: hasBody ? { "Content-Type": "application/json" } : {},
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
    timeoutMs: 15_000,
    maxBytes: 2_000_000,
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  const envelope = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (!res.ok || envelope.ok !== true) {
    const description =
      typeof envelope.description === "string"
        ? envelope.description
        : res.statusText || `HTTP ${res.status}`;
    throw new Error(`Telegram ${method} failed (${res.status}): ${description}`);
  }
  return envelope.result;
}

// Loosely-typed JSON readers, re-exported so the nodes import them from here.
export { pickString, pickNumber } from "@monark/integration-kit/server";
