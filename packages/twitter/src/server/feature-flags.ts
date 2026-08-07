import { registerFlags } from "@monark/feature-flags/server";

// Ships dark : the module registers its nodes, but the `/x` connect surface and
// (by convention) new X automations gate on this until an org opts in.
const TWITTER_FLAGS = {
  enabled: {
    description: "Enable the X (Twitter) integration (connect an account, X action nodes).",
    defaultOn: false,
  },
} as const;

export function registerTwitterFeatureFlags(): void {
  registerFlags("twitter", TWITTER_FLAGS);
}
