import { registerPermissions } from "@monark/rbac/server";

// `read` sees only names + metadata (never a value); `manage` can set / delete.
// The plaintext value is never exposed over tRPC under any permission — there is
// no read-value procedure at all. Built-in ADMIN / SYSADMIN short-circuit both.
const SECRETS_PERMISSIONS = {
  read: {
    description:
      "View the names and metadata of the organization's secrets. The secret values are never exposed.",
    category: "secrets",
  },
  manage: {
    description:
      "Create, update, and delete the organization's encrypted secrets (external access tokens, API keys).",
    category: "secrets",
  },
} as const;

export function registerSecretsPermissions(): void {
  registerPermissions("secrets", SECRETS_PERMISSIONS);
}
