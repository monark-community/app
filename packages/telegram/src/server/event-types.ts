import { registerEventTypes } from "@monark/common";

// Operator-facing descriptions + payload-field metadata for the Telegram events,
// so they appear (grouped under "telegram") in the automation Event Trigger
// picker — with `{{ trigger.* }}` fields — and the webhooks subscription picker.
// `orgScoped: true` : each event belongs to the org the bot is connected for (it
// carries `organizationId`), so subscriptions route per-org.
const ORG = {
  key: "organizationId",
  type: "string",
  description: "The Monark organization the bot is connected for.",
} as const;
const CHAT_ID = {
  key: "chatId",
  type: "number",
  description: "The chat the message was sent in (reply here).",
} as const;
const CHAT_TYPE = {
  key: "chatType",
  type: "string",
  description: "private | group | supergroup | channel.",
} as const;
const MESSAGE_ID = {
  key: "messageId",
  type: "number",
  description: "The message id.",
} as const;
const FROM_ID = {
  key: "fromId",
  type: "number",
  description: "The sender's Telegram user id.",
} as const;
const FROM_USERNAME = {
  key: "fromUsername",
  type: "string",
  description: "The sender's @username (empty if they have none).",
} as const;
const FROM_FIRST_NAME = {
  key: "fromFirstName",
  type: "string",
  description: "The sender's first name.",
} as const;

const TELEGRAM_EVENT_TYPES = {
  "telegram.message-received": {
    description: "A (non-command) text message was sent to the connected bot.",
    orgScoped: true,
    fields: [
      ORG,
      CHAT_ID,
      CHAT_TYPE,
      MESSAGE_ID,
      { key: "text", type: "string", description: "The message text." },
      FROM_ID,
      FROM_USERNAME,
      FROM_FIRST_NAME,
    ],
  },
  "telegram.command": {
    description: "A /command was sent to the connected bot (e.g. /start, /help).",
    orgScoped: true,
    fields: [
      ORG,
      CHAT_ID,
      CHAT_TYPE,
      MESSAGE_ID,
      { key: "command", type: "string", description: "The command, without its leading slash." },
      { key: "args", type: "string", description: "Everything after the command word, trimmed." },
      FROM_ID,
      FROM_USERNAME,
      FROM_FIRST_NAME,
    ],
  },
} as const;

export function registerTelegramEventTypes(): void {
  registerEventTypes("telegram", TELEGRAM_EVENT_TYPES);
}
