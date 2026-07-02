import { registerPermissions } from "@monark/rbac/server";

const WEBHOOKS_PERMISSIONS = {
  read: {
    description: "View webhook endpoints, subscriptions, and delivery history.",
    category: "platform",
  },
  write: {
    description: "Create, edit, delete, and rotate secrets on webhook endpoints.",
    category: "platform",
  },
  retry: {
    description: "Manually retry a failed webhook delivery.",
    category: "platform",
  },
} as const;

export function registerWebhooksPermissions(): void {
  registerPermissions("webhooks", WEBHOOKS_PERMISSIONS);
}
