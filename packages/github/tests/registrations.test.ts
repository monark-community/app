import { describe, expect, it } from "vitest";
import { listEventTypes } from "@monark/common";
import { listFlagDefinitions } from "@monark/feature-flags/server";
import { listPermissionDescriptors } from "@monark/rbac/server";
import { registerGithubEventTypes } from "../src/server/event-types";
import { registerGithubFeatureFlags } from "../src/server/feature-flags";
import { registerGithubPermissions } from "../src/server/permissions";

// Boot-time registrations (event types / flag / permissions) — the pieces that
// were at 0 % function coverage.

describe("github registrations", () => {
  it("registers github.enabled defaulting off", () => {
    registerGithubFeatureFlags();
    expect(listFlagDefinitions().find((f) => f.key === "github.enabled")?.defaultOn).toBe(false);
  });

  it("registers event types under the github namespace", () => {
    registerGithubEventTypes();
    expect(listEventTypes().some((e) => e.type.startsWith("github."))).toBe(true);
  });

  it("registers github permissions", () => {
    registerGithubPermissions();
    expect(listPermissionDescriptors().some((p) => p.module === "github")).toBe(true);
  });
});
