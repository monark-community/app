import { registerFlags } from "@monark/feature-flags/server";

// Feature flags owned by the achievements module (namespace `achievements.*`).
const ACHIEVEMENTS_FLAGS = {
  enabled: {
    description:
      "Configurable event-driven achievements : the /admin/achievements config, the award engine (event subscriber + worker), and the user gallery. Kill switch for the whole feature.",
    defaultOn: false,
  },
} as const;

export function registerAchievementsFeatureFlags(): void {
  registerFlags("achievements", ACHIEVEMENTS_FLAGS);
}
