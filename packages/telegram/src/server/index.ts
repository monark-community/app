// Public surface of @monark/telegram/server — wired into services/api at boot.
export { telegramRouter } from "./router";
export { registerTelegramEventTypes } from "./event-types";
export { registerTelegramFeatureFlags } from "./feature-flags";
export { registerTelegramPermissions } from "./permissions";
export { registerTelegramAutomationNodes } from "./nodes";
export { handleTelegramWebhook, mapTelegramUpdate } from "./webhook";
export { telegramCall } from "./client";
