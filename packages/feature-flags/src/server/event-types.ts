import { registerEventTypes } from "@monark/common";

const FEATURE_FLAGS_EVENT_TYPES = {
  "feature-flag.flipped": {
    description:
      "An override was set or removed for a flag. The payload carries the new effective value + the scope (org / role / user / global).",
    fields: [
      { key: "module", type: "string", description: "The module owning the flag." },
      { key: "flagKey", type: "string", description: "The flag's key within its module." },
      {
        key: "scope",
        type: "string",
        description: "The override scope: org, role, user, or global.",
      },
      { key: "enabled", type: "boolean", description: "The new effective value of the flag." },
      { key: "actorId", type: "string", description: "The user who set or removed the override." },
    ],
  },
} as const;

export function registerFeatureFlagsEventTypes(): void {
  registerEventTypes("feature-flags", FEATURE_FLAGS_EVENT_TYPES);
}
