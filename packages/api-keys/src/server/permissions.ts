import { registerPermissions } from "@monark/rbac/server";

// Managing keys (create / list / revoke) is one capability. It does NOT widen
// what a key can do : a key's authority is always its owner's own RBAC grants
// intersected with the key's scopes. Built-in ADMIN / SYSADMIN short-circuit.
const API_KEYS_PERMISSIONS = {
  manage: {
    description:
      "Create, list, and revoke your own API keys. A key never grants more than its owner's own permissions.",
    category: "api-keys",
  },
  "manage-service-accounts": {
    description:
      "Create and manage the organization's service accounts (machine principals) and their API keys. Admin-tier : a service-account key acts as an org-owned identity, not as a person.",
    category: "api-keys",
  },
} as const;

export function registerApiKeysPermissions(): void {
  registerPermissions("api-keys", API_KEYS_PERMISSIONS);
}
