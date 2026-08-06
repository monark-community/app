import type { AutomationNodeConfigField } from "@monark/automation/contracts";
import type { NodeExecutionContext } from "@monark/automation/server";
import { TELEGRAM_BOT_TOKEN_KEY } from "../../contracts/telegram";

export const TELEGRAM_ICON = "Telegram";
export const TELEGRAM_CATEGORY = "telegram";

// Telegram stores one canonical bot token per org (set by the connect flow), so
// nodes don't carry a token-secret field like GitHub / Discord do — they read
// the connected token directly. The chat id is the per-node target.
export const CHAT_ID_FIELD = {
  key: "chatId",
  label: "Chat ID",
  type: "text",
  required: true,
  placeholder: "123456789",
  help: "The target chat: a numeric id (e.g. {{ trigger.chatId }} on a Telegram trigger) or @channelusername.",
} as const;

/** A `select` of Telegram's text formatting modes, shared by text-bearing nodes. */
export const PARSE_MODE_FIELD: AutomationNodeConfigField = {
  key: "parseMode",
  label: "Format",
  type: "select",
  options: [
    { value: "none", label: "Plain text" },
    { value: "Markdown", label: "Markdown" },
    { value: "HTML", label: "HTML" },
  ],
};

/** Resolve the org's connected bot token, or throw a clear "not connected" error. */
export async function requireBotToken(ctx: NodeExecutionContext): Promise<string> {
  const token = await ctx.getSecret(TELEGRAM_BOT_TOKEN_KEY);
  if (!token) {
    throw new Error(
      "Telegram is not connected for this organization. Connect a bot under Telegram settings first.",
    );
  }
  return token;
}

/** A non-empty chat id (numeric id or @username) as a string, or throw. */
export function requireChatId(chatId: unknown): string {
  const id =
    typeof chatId === "string" ? chatId.trim() : typeof chatId === "number" ? String(chatId) : "";
  if (!id) throw new Error("A chat ID is required.");
  return id;
}

/** Map the `parseMode` config to a Telegram `parse_mode`, or undefined for plain. */
export function parseModeParam(value: unknown): "Markdown" | "HTML" | undefined {
  return value === "Markdown" || value === "HTML" ? value : undefined;
}
