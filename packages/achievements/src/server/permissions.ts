import { registerPermissions } from "@monark/rbac/server";

const ACHIEVEMENTS_PERMISSIONS = {
  manage: {
    description: "Create + configure achievements and their award conditions.",
    category: "achievements",
  },
  view: {
    description: "View the achievements catalog and one's own awards.",
    category: "achievements",
  },
} as const;

export function registerAchievementsPermissions(): void {
  registerPermissions("achievements", ACHIEVEMENTS_PERMISSIONS);
}
