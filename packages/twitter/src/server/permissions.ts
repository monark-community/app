import { registerPermissions } from "@monark/rbac/server";

// Permissions owned by the Twitter/X module. ADMIN / SYSADMIN short-circuit
// every check, so admins get these with no backfill. Using an X node inside an
// automation is gated by the automation module's own permissions plus the
// connected credentials ; this covers the connection surface only.
const TWITTER_PERMISSIONS = {
  manage: {
    description: "Connect X (Twitter) for the org: store the OAuth 1.0a API credentials.",
    category: "twitter",
  },
} as const;

export function registerTwitterPermissions(): void {
  registerPermissions("twitter", TWITTER_PERMISSIONS);
}
