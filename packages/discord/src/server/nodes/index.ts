import { registerAutomationNodes } from "@monark/automation/server";
import { discordGetChannelNode } from "./channel";
import {
  discordAddReactionNode,
  discordEditMessageNode,
  discordListMessagesNode,
  discordSendMessageNode,
  discordSendWebhookMessageNode,
} from "./messages";

let registered = false;

/** Register the Discord action nodes under the `discord` namespace. Idempotent. */
export function registerDiscordAutomationNodes(): void {
  if (registered) return;
  registered = true;
  registerAutomationNodes("discord", {
    "send-message": discordSendMessageNode,
    "send-webhook-message": discordSendWebhookMessageNode,
    "edit-message": discordEditMessageNode,
    "add-reaction": discordAddReactionNode,
    "list-messages": discordListMessagesNode,
    "get-channel": discordGetChannelNode,
  });
}
