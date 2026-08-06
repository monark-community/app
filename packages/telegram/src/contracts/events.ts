import type { DomainEventBase } from "@monark/common/contracts/events";

// Domain events the Telegram module emits from an inbound Telegram webhook
// (updates Telegram POSTs after `setWebhook`), mapped into the Monark event bus
// so automations can trigger on them. Every event carries `organizationId` (the
// org the bot is connected for — how the automation + webhook subscribers route
// it) plus the flat scalars a flow acts on : the chat + sender it came from, so
// a reply node can target `{{ trigger.chatId }}`. Payloads stay shallow ; we
// model text messages + slash commands (the MVP `allowed_updates: ["message"]`),
// not the full Telegram Update object.

export type TelegramMessageReceivedEvent = DomainEventBase & {
  type: "telegram.message-received";
  organizationId: string;
  /** The chat the message was sent in (reply here). */
  chatId: number;
  /** private | group | supergroup | channel. */
  chatType: string;
  messageId: number;
  text: string;
  fromId: number;
  fromUsername: string;
  fromFirstName: string;
};

export type TelegramCommandEvent = DomainEventBase & {
  type: "telegram.command";
  organizationId: string;
  chatId: number;
  chatType: string;
  messageId: number;
  /** The command without its leading slash / `@botname` suffix, lower-cased. */
  command: string;
  /** Everything after the command word, trimmed (empty when none). */
  args: string;
  fromId: number;
  fromUsername: string;
  fromFirstName: string;
};

export type TelegramEvents = TelegramMessageReceivedEvent | TelegramCommandEvent;
