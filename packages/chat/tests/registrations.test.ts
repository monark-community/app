import { describe, expect, it } from "vitest";
import { listEventTypes } from "@monark/common";
import { listFlagDefinitions } from "@monark/feature-flags/server";
import { listPermissionDescriptors } from "@monark/rbac/server";
import { registerChatEventTypes } from "../src/server/event-types";
import { registerChatFeatureFlags } from "../src/server/feature-flags";
import { registerChatPermissions } from "../src/server/permissions";

// Boot-time registrations (event types / flag / permissions) — the pieces that
// were at 0 % function coverage.

describe("chat registrations", () => {
  it("registers chat.enabled defaulting off", () => {
    registerChatFeatureFlags();
    expect(listFlagDefinitions().find((f) => f.key === "chat.enabled")?.defaultOn).toBe(false);
  });

  it("registers chat.org-branding defaulting off", () => {
    registerChatFeatureFlags();
    expect(listFlagDefinitions().find((f) => f.key === "chat.org-branding")?.defaultOn).toBe(false);
  });

  it("registers event types under the chat namespace", () => {
    registerChatEventTypes();
    expect(listEventTypes().some((e) => e.type.startsWith("chat."))).toBe(true);
  });

  it("registers chat permissions", () => {
    registerChatPermissions();
    expect(listPermissionDescriptors().some((p) => p.module === "chat")).toBe(true);
  });
});
