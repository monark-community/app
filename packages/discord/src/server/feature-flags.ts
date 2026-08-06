import { registerFlags } from "@monark/feature-flags/server";

const DISCORD_FLAGS = {
  enabled: {
    description: "Enable the Discord integration (Discord action nodes for automations).",
    defaultOn: false,
  },
} as const;

export function registerDiscordFeatureFlags(): void {
  registerFlags("discord", DISCORD_FLAGS);
}
