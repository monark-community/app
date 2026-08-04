import { describe, it, expect } from "vitest";
import { isTriggerableEventType, isPickerTriggerEventType } from "../src/server/subscriber";

describe("isTriggerableEventType (engine gate)", () => {
  it("excludes events that can't fire a run", () => {
    expect(isTriggerableEventType("automation.run-succeeded")).toBe(false);
    expect(isTriggerableEventType("automation.created")).toBe(false);
    expect(isTriggerableEventType("feature-flag.flipped")).toBe(false);
  });

  it("allows real domain events — including ones the picker hides", () => {
    expect(isTriggerableEventType("kanban.card-created")).toBe(true);
    expect(isTriggerableEventType("data-models.record-updated")).toBe(true);
    // Can still fire an existing automation ; only hidden from the picker.
    expect(isTriggerableEventType("notification.created")).toBe(true);
  });
});

describe("isPickerTriggerEventType (picker curation)", () => {
  it("hides low-value / noisy events", () => {
    for (const type of [
      "notification.created",
      "notification.preference-changed",
      "rbac.role-created",
      "rbac.role-updated",
      "rbac.role-deleted",
    ]) {
      expect(isPickerTriggerEventType(type)).toBe(false);
    }
  });

  it("keeps the useful signals", () => {
    for (const type of [
      "notification.delivery-failed",
      "rbac.role-assigned",
      "rbac.role-revoked",
      "kanban.card-created",
      "data-models.record-created",
    ]) {
      expect(isPickerTriggerEventType(type)).toBe(true);
    }
  });

  it("still drops the can't-fire events", () => {
    expect(isPickerTriggerEventType("automation.run-succeeded")).toBe(false);
    expect(isPickerTriggerEventType("feature-flag.flipped")).toBe(false);
  });
});
