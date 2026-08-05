import { registerPermissions } from "@monark/rbac/server";

// Permissions owned by the GitHub module. ADMIN / SYSADMIN short-circuit every
// check, so admins get these with no backfill. Using a GitHub node inside an
// automation is gated by the automation module's own permissions plus holding
// the token secret ; this covers the connection surface only.
const GITHUB_PERMISSIONS = {
  manage: {
    description: "Connect GitHub for the org: set the token secret, generate the webhook secret.",
    category: "github",
  },
} as const;

export function registerGithubPermissions(): void {
  registerPermissions("github", GITHUB_PERMISSIONS);
}
