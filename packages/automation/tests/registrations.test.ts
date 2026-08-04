import { describe, expect, it } from "vitest";
import { getEventTypeDescriptor, listEventTypes } from "@monark/common";
import { listFlagDefinitions } from "@monark/feature-flags/server";
import { getNotificationKindDef } from "@monark/notifications/contracts";
import { registerAutomationEventTypes } from "../src/server/event-types";
import { registerAutomationFeatureFlags } from "../src/server/feature-flags";
import { registerAutomationNotificationKinds } from "../src/server/notification-kinds";

// The automation module's three boot-time registrations (event types, the
// `automation.enabled` flag, the custom-message notification kind). Pure pushes
// into the respective in-memory registries, so a unit test can call each and
// assert the contract the module contributes. Each registry is a process-global
// singleton ; these run in vitest's per-file isolate, so a fresh graph each run.

describe("registerAutomationEventTypes", () => {
  const EVENTS = [
    "automation.created",
    "automation.updated",
    "automation.deleted",
    "automation.run-started",
    "automation.run-succeeded",
    "automation.run-failed",
  ];

  it("registers the automation lifecycle + run event types", () => {
    registerAutomationEventTypes();
    const registered = new Set(listEventTypes().map((e) => e.type));
    for (const type of EVENTS) {
      expect(registered.has(type)).toBe(true);
      expect(getEventTypeDescriptor(type)?.description.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("registerAutomationFeatureFlags", () => {
  it("registers automation.enabled defaulting on", () => {
    registerAutomationFeatureFlags();
    const flag = listFlagDefinitions().find((f) => f.key === "automation.enabled");
    expect(flag).toBeDefined();
    expect(flag?.defaultOn).toBe(true);
  });
});

describe("registerAutomationNotificationKinds", () => {
  it("registers the custom-message kind over in-app + email", () => {
    registerAutomationNotificationKinds();
    const def = getNotificationKindDef("automation.custom-message");
    expect(def).toBeDefined();
    expect(def?.channels).toEqual(expect.arrayContaining(["IN_APP", "EMAIL"]));
    expect(def?.template).toBe("automation/custom-message");
  });

  it("is idempotent : a second call is a no-op", () => {
    // The module guards re-registration with a module-level flag ; calling
    // again must not throw.
    expect(() => registerAutomationNotificationKinds()).not.toThrow();
  });
});
