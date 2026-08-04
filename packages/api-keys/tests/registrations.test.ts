import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  _resetEventRegistryForTesting,
  getEventTypeDescriptor,
  listEventTypes,
} from "@monark/common";
import { registerApiKeysEventTypes } from "../src/server/event-types";

// The api-keys module's boot-time event-type registration. Pure (pushes into
// the in-memory event registry), so a unit test can assert the contract it
// contributes to the webhook subscription picker — and pin the promise that no
// event ever carries the key plaintext / hash.

beforeEach(() => {
  _resetEventRegistryForTesting();
});

afterAll(() => {
  _resetEventRegistryForTesting();
});

describe("registerApiKeysEventTypes", () => {
  const EVENTS = [
    "api-keys.key-created",
    "api-keys.key-revoked",
    "api-keys.service-account-created",
    "api-keys.service-account-disabled",
  ];

  it("registers all four api-keys event types with descriptions", () => {
    registerApiKeysEventTypes();
    const registered = new Set(listEventTypes().map((e) => e.type));
    for (const type of EVENTS) {
      expect(registered.has(type)).toBe(true);
      expect(getEventTypeDescriptor(type)?.description.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("never exposes a plaintext / hash field on any event", () => {
    registerApiKeysEventTypes();
    for (const type of EVENTS) {
      const fields = getEventTypeDescriptor(type)?.fields.map((f) => f.key) ?? [];
      expect(fields).not.toContain("plaintext");
      expect(fields).not.toContain("hash");
      expect(fields).not.toContain("tokenHash");
    }
  });
});
