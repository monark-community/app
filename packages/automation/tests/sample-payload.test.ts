import { afterAll, describe, expect, it } from "vitest";
import { _resetEventRegistryForTesting, registerEventTypes } from "@monark/common";
import { sampleFieldValue, sampleTriggerPayload } from "../src/server/sample-payload";

afterAll(() => _resetEventRegistryForTesting());

describe("sampleFieldValue", () => {
  it("returns a type-appropriate placeholder", () => {
    expect(sampleFieldValue("count", "number")).toBe(1);
    expect(sampleFieldValue("active", "boolean")).toBe(true);
    expect(sampleFieldValue("meta", "object")).toEqual({});
    expect(typeof sampleFieldValue("when", "date")).toBe("string");
    expect(new Date(sampleFieldValue("when", "date") as string).toString()).not.toBe(
      "Invalid Date",
    );
  });

  it("labels a plain string placeholder by its key", () => {
    expect(sampleFieldValue("userId", "string")).toBe("sample-userId");
    expect(sampleFieldValue("triggeredBy", "string")).toBe("sample-triggeredBy");
  });

  it("keeps an email-shaped key valid so email-validated inputs still pass", () => {
    expect(sampleFieldValue("email", "string")).toBe("sample@example.com");
    expect(sampleFieldValue("newEmail", "string")).toBe("sample@example.com");
  });
});

describe("sampleTriggerPayload", () => {
  it("seeds a placeholder for each declared field plus the base envelope", () => {
    registerEventTypes("test", {
      "test.totp-disabled": {
        description: "test",
        fields: [
          { key: "userId", type: "string", description: "who" },
          { key: "triggeredBy", type: "string", description: "how" },
        ],
      },
    });

    const payload = sampleTriggerPayload("test.totp-disabled", {
      organizationId: "org_1",
      actorId: "user_1",
    });

    // The declared fields resolve instead of coming back undefined — the bug this
    // fixed (a `{{ trigger.userId }}` reference was empty on a manual test run).
    expect(payload.userId).toBe("sample-userId");
    expect(payload.triggeredBy).toBe("sample-triggeredBy");
    // Base envelope is authoritative.
    expect(payload.type).toBe("test.totp-disabled");
    expect(payload.organizationId).toBe("org_1");
    expect(payload.actorId).toBe("user_1");
    expect(payload.manual).toBe(true);
    expect(typeof payload.occurredAt).toBe("string");
  });

  it("still carries the common base fields for an unregistered event type", () => {
    const payload = sampleTriggerPayload("nope.unknown", {
      organizationId: "org_1",
      actorId: "user_1",
    });
    // `occurredAt` / `type` come from the common fields ; base overrides them.
    expect(payload.type).toBe("nope.unknown");
    expect(typeof payload.occurredAt).toBe("string");
  });
});
