import { describe, expect, it } from "vitest";
import { eventFieldsFor, getEventTypeDescriptor } from "@monark/common";
import { listFlagDefinitions } from "@monark/feature-flags/server";
import { isKnownPermission, listPermissionDescriptors } from "@monark/rbac/server";
import { registerAchievementsEventTypes } from "../src/server/event-types";
import { registerAchievementsFeatureFlags } from "../src/server/flags";
import { registerAchievementsPermissions } from "../src/server/permissions";

// The module's boot-time registrations (event type / flag / permissions). Pure
// registry pushes, so a unit test calls each and asserts the contract it
// contributes — the pieces that were sitting at 0 % function coverage.

describe("registerAchievementsEventTypes", () => {
  it("registers achievements.awarded with a described payload", () => {
    registerAchievementsEventTypes();
    const d = getEventTypeDescriptor("achievements.awarded");
    expect(d).toBeDefined();
    expect((d?.description.length ?? 0) > 0).toBe(true);
    expect(eventFieldsFor("achievements.awarded").length).toBeGreaterThan(0);
  });
});

describe("registerAchievementsFeatureFlags", () => {
  it("registers achievements.enabled defaulting off (kill switch)", () => {
    registerAchievementsFeatureFlags();
    const flag = listFlagDefinitions().find((f) => f.key === "achievements.enabled");
    expect(flag).toBeDefined();
    expect(flag?.defaultOn).toBe(false);
  });
});

describe("registerAchievementsPermissions", () => {
  it("registers the manage + view permissions", () => {
    registerAchievementsPermissions();
    expect(isKnownPermission("achievements.manage")).toBe(true);
    expect(isKnownPermission("achievements.view")).toBe(true);
    const perms = listPermissionDescriptors()
      .filter((p) => p.module === "achievements")
      .map((p) => p.key)
      .sort();
    expect(perms).toEqual(["manage", "view"]);
  });
});
