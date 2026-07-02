import { registerEventTypes } from "@monark/common";

const FEATURE_FLAGS_EVENT_TYPES = {
  "feature-flag.flipped": {
    description:
      "An override was set or removed for a flag. The payload carries the new effective value + the scope (org / role / user / global).",
  },
} as const;

export function registerFeatureFlagsEventTypes(): void {
  registerEventTypes("feature-flags", FEATURE_FLAGS_EVENT_TYPES);
}
