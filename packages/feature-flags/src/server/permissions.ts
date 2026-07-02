import { registerPermissions } from "@monark/rbac/server";

const FEATURE_FLAGS_PERMISSIONS = {
  read: {
    description: "View feature flag definitions and current overrides.",
    category: "platform",
  },
  write: {
    description: "Set or remove feature flag overrides.",
    category: "platform",
  },
} as const;

export function registerFeatureFlagsPermissions(): void {
  registerPermissions("feature-flags", FEATURE_FLAGS_PERMISSIONS);
}
