import { describe, expect, it } from "vitest";
import { listFlagDefinitions } from "@monark/feature-flags/server";
import { isKnownPermission } from "@monark/rbac/server";
import { registerTwitterFeatureFlags } from "../src/server/feature-flags";
import { registerTwitterPermissions } from "../src/server/permissions";

// Boot-time registrations. The flag ships dark (default off) ; assert both the
// flag and the manage permission the module contributes.

describe("registerTwitterFeatureFlags", () => {
  it("registers twitter.enabled defaulting off (ships dark)", () => {
    registerTwitterFeatureFlags();
    const flag = listFlagDefinitions().find((f) => f.key === "twitter.enabled");
    expect(flag).toBeDefined();
    expect(flag?.defaultOn).toBe(false);
  });
});

describe("registerTwitterPermissions", () => {
  it("registers the manage permission", () => {
    registerTwitterPermissions();
    expect(isKnownPermission("twitter.manage")).toBe(true);
  });
});
