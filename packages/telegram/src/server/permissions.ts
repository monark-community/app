import { registerPermissions } from "@monark/rbac/server";

// Permissions owned by the Telegram module. ADMIN / SYSADMIN short-circuit every
// check, so admins get these with no backfill. Using a Telegram node inside an
// automation is gated by the automation module's own permissions plus the
// connected bot token ; this covers the connection surface only.
const TELEGRAM_PERMISSIONS = {
  manage: {
    description:
      "Connect Telegram for the org: store the bot token + register the webhook with Telegram.",
    category: "telegram",
  },
} as const;

export function registerTelegramPermissions(): void {
  registerPermissions("telegram", TELEGRAM_PERMISSIONS);
}
