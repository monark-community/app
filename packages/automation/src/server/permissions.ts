import { registerPermissions } from "@monark/rbac/server";

// Permissions owned by the automation module. Keys use hyphens, not dots (the
// rbac registry's KEY_RE forbids "." inside a key). ADMIN / SYSADMIN
// short-circuit every check, so admins get these with no backfill.
const AUTOMATION_PERMISSIONS = {
  view: {
    description: "View automations and their run history.",
    category: "automation",
  },
  create: {
    description: "Create and edit automation flows (draft, wire the node graph).",
    category: "automation",
  },
  manage: {
    description:
      "Enable/disable and delete automations, including flows that use privileged nodes (RBAC, user management).",
    category: "automation",
  },
  run: {
    description: "Manually trigger an automation run (test run).",
    category: "automation",
  },
} as const;

export function registerAutomationPermissions(): void {
  registerPermissions("automation", AUTOMATION_PERMISSIONS);
}
