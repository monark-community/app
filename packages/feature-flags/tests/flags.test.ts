import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetFlagRegistryForTesting,
  getFlagDef,
  isKnownFlag,
  listFlagDescriptors,
  listFlagKeys,
  parseFlagKey,
  registerFlags,
} from "../src/contracts/flags";

beforeEach(() => {
  _resetFlagRegistryForTesting();
  // Replicate the canonical core registrations the api boots with so
  // the assertions below match production resolution.
  registerFlags("auth", {
    "trusted-devices": {
      description: "Track trusted devices on sign-in.",
      defaultOn: true,
    },
    "totp-trust-devices": {
      description: "Skip TOTP on recognized devices.",
      defaultOn: true,
    },
    "totp-required-admin": {
      description: "Enforce TOTP for admin roles within 7 days.",
      defaultOn: true,
    },
  });
});

afterEach(() => {
  _resetFlagRegistryForTesting();
});

describe("feature-flags/flags.registerFlags", () => {
  it("exposes the registered auth flags with the expected defaults", () => {
    expect(getFlagDef("auth.trusted-devices")?.defaultOn).toBe(true);
    expect(getFlagDef("auth.totp-trust-devices")?.defaultOn).toBe(true);
    expect(getFlagDef("auth.totp-required-admin")?.defaultOn).toBe(true);
  });

  it("every registered flag has a non-empty description", () => {
    for (const desc of listFlagDescriptors()) {
      expect(
        desc.description.length,
        `flag ${desc.module}.${desc.key} has empty description`,
      ).toBeGreaterThan(0);
    }
  });

  it("rejects invalid module names", () => {
    expect(() =>
      registerFlags("BadModule", { x: { description: "x", defaultOn: false } }),
    ).toThrowError(/Invalid feature-flag module name/);
  });

  it("rejects invalid flag keys", () => {
    expect(() =>
      registerFlags("posts", { "bad key": { description: "x", defaultOn: false } }),
    ).toThrowError(/Invalid feature-flag key/);
  });

  it("lets a non-core module register its own flags without colliding", () => {
    registerFlags("posts", {
      "drafts-enabled": {
        description: "Allow saving posts as drafts.",
        defaultOn: true,
      },
    });
    expect(isKnownFlag("posts.drafts-enabled")).toBe(true);
    expect(getFlagDef("posts.drafts-enabled")?.defaultOn).toBe(true);
    // Core flags are still resolvable.
    expect(isKnownFlag("auth.trusted-devices")).toBe(true);
  });
});

describe("feature-flags/flags.isKnownFlag", () => {
  it("returns true for registered dotted keys", () => {
    expect(isKnownFlag("auth.trusted-devices")).toBe(true);
    expect(isKnownFlag("auth.totp-required-admin")).toBe(true);
  });

  it("returns false for unknown keys, malformed input, and prototype hits", () => {
    expect(isKnownFlag("nope")).toBe(false);
    expect(isKnownFlag("")).toBe(false);
    expect(isKnownFlag("toString")).toBe(false);
    expect(isKnownFlag("hasOwnProperty")).toBe(false);
    expect(isKnownFlag("__proto__")).toBe(false);
    expect(isKnownFlag(".missing-module")).toBe(false);
    expect(isKnownFlag("missing-key.")).toBe(false);
  });
});

describe("feature-flags/flags.parseFlagKey", () => {
  it("splits on the first dot ; keys can contain further dashes / underscores", () => {
    expect(parseFlagKey("auth.trusted-devices")).toEqual({
      module: "auth",
      key: "trusted-devices",
    });
    expect(parseFlagKey("posts.draft_mode-v2")).toEqual({
      module: "posts",
      key: "draft_mode-v2",
    });
  });

  it("returns null on malformed input", () => {
    expect(parseFlagKey("no-dot")).toBeNull();
    expect(parseFlagKey(".leading-dot")).toBeNull();
    expect(parseFlagKey("trailing-dot.")).toBeNull();
  });
});

describe("feature-flags/flags.listFlagKeys", () => {
  it("returns every registered key in dotted form, sorted", () => {
    const keys = listFlagKeys();
    expect(keys).toEqual([
      "auth.totp-required-admin",
      "auth.totp-trust-devices",
      "auth.trusted-devices",
    ]);
  });
});
