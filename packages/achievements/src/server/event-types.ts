import { registerEventTypes } from "@monark/common";

export function registerAchievementsEventTypes(): void {
  registerEventTypes("achievements", {
    "achievements.awarded": {
      description: "A user earned an achievement (its threshold was crossed).",
      fields: [
        {
          key: "organizationId",
          type: "string",
          description: "The organization the achievement belongs to.",
        },
        { key: "achievementId", type: "string", description: "The achievement that was awarded." },
        { key: "achievementName", type: "string", description: "The achievement's name." },
        { key: "points", type: "number", description: "The achievement's point value." },
        { key: "userId", type: "string", description: "The user who earned it." },
        {
          key: "actorId",
          type: "string",
          description:
            "Same as userId (the conventional actor field), so this event can itself trigger an achievement.",
        },
      ],
    },
  });
}
