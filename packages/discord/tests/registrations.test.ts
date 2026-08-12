import { describe, expect, it } from "vitest";
import { listFlagDefinitions } from "@monark/feature-flags/server";
import { registerDiscordFeatureFlags } from "../src/server/feature-flags";

describe("registerDiscordFeatureFlags", () => {
  it("registers discord.enabled defaulting off", () => {
    registerDiscordFeatureFlags();
    expect(listFlagDefinitions().find((f) => f.key === "discord.enabled")?.defaultOn).toBe(false);
  });
});
