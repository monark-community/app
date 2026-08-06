import { registerAutomationNodes } from "@monark/automation/server";
import {
  telegramDeleteMessageNode,
  telegramEditMessageNode,
  telegramGetChatNode,
  telegramSendMessageNode,
  telegramSendPhotoNode,
} from "./messages";

let registered = false;

/**
 * Register the Telegram action nodes under the `telegram` namespace, exactly
 * like Core's `registerBuiltinAutomationNodes`. Called once at api boot.
 * Idempotent.
 */
export function registerTelegramAutomationNodes(): void {
  if (registered) return;
  registered = true;
  registerAutomationNodes("telegram", {
    "send-message": telegramSendMessageNode,
    "edit-message": telegramEditMessageNode,
    "delete-message": telegramDeleteMessageNode,
    "send-photo": telegramSendPhotoNode,
    "get-chat": telegramGetChatNode,
  });
}
