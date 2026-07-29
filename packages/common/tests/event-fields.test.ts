import { afterEach, describe, expect, it } from "vitest";
import {
  COMMON_EVENT_FIELDS,
  eventFieldsFor,
  registerEventTypes,
  _resetEventRegistryForTesting,
} from "../src/event-registry";

afterEach(() => _resetEventRegistryForTesting());

const keys = (type: string) => eventFieldsFor(type).map((f) => f.key);

describe("eventFieldsFor", () => {
  it("returns just the common base fields for an unregistered type", () => {
    expect(eventFieldsFor("nope.unknown")).toEqual([...COMMON_EVENT_FIELDS]);
  });

  it("returns a registered type's declared fields first, then the common base", () => {
    registerEventTypes("auth", {
      "totp.disabled": {
        description: "TOTP turned off.",
        fields: [
          { key: "userId", type: "string", description: "who" },
          { key: "triggeredBy", type: "string", description: "how" },
        ],
      },
    });
    // Declared fields lead (the specific "who"), common base ("when" + type) trail.
    expect(keys("totp.disabled")).toEqual(["userId", "triggeredBy", "occurredAt", "type"]);
  });

  it("returns only the common base for a type registered without fields", () => {
    registerEventTypes("auth", { "totp.enabled": { description: "on" } });
    expect(keys("totp.enabled")).toEqual(["occurredAt", "type"]);
  });

  it("always includes occurredAt and type in the common base", () => {
    expect(COMMON_EVENT_FIELDS.map((f) => f.key)).toEqual(["occurredAt", "type"]);
    expect(COMMON_EVENT_FIELDS.find((f) => f.key === "occurredAt")?.type).toBe("date");
  });
});
