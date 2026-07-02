import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetNotificationRegistryForTesting,
  getNotificationKindDef,
  getNotificationTemplate,
  isKnownNotificationKind,
  listNotificationKindDescriptors,
  listNotificationKinds,
} from "../src/contracts/registry";
import {
  _resetCoreKindsRegisteredForTesting,
  registerCoreNotificationKinds,
} from "../src/server/register-core-kinds";

beforeEach(() => {
  _resetNotificationRegistryForTesting();
  _resetCoreKindsRegisteredForTesting();
  registerCoreNotificationKinds();
});

afterEach(() => {
  _resetNotificationRegistryForTesting();
  _resetCoreKindsRegisteredForTesting();
});

describe("notifications/registry shape after registerCoreNotificationKinds", () => {
  it("registers the Phase 1 set of kinds", () => {
    const kinds = listNotificationKinds();
    expect(kinds).toContain("auth.new-device");
    expect(kinds).toContain("auth.password-changed");
    expect(kinds).toContain("auth.totp-enabled");
    expect(kinds).toContain("auth.totp-disabled");
    expect(kinds).toContain("account.email-changed");
    expect(kinds).toContain("account.deletion-scheduled");
    expect(kinds).toContain("account.deletion-canceled");
  });

  it("requires email for every SECURITY-category kind", () => {
    // Most SECURITY kinds are required-email so an operator who's
    // opted out of every other channel still gets the alert ; per-
    // permanent-failure webhook deliveries are an explicit
    // exception (operators opt out via the prefs UI to keep a
    // flapping receiver from spamming the inbox). The endpoint-
    // auto-disabled kind covers the actionable signal so dropping
    // requiredEmail on the per-failure kind doesn't lose coverage.
    const REQUIRED_EMAIL_EXCEPTIONS: ReadonlySet<string> = new Set([
      "webhooks.delivery-permanently-failed",
    ]);
    for (const desc of listNotificationKindDescriptors()) {
      if (desc.category === "SECURITY" && !REQUIRED_EMAIL_EXCEPTIONS.has(desc.kind)) {
        expect(desc.requiredEmail, `${desc.kind} should set requiredEmail`).toBe(true);
      }
    }
  });

  it("every kind's template id resolves to a registered messages bundle", () => {
    for (const desc of listNotificationKindDescriptors()) {
      const messages = getNotificationTemplate(desc.template);
      expect(messages, `template missing for ${desc.kind}`).toBeDefined();
    }
  });

  it("every template has en + fr slots with a non-empty inapp.subject", () => {
    for (const desc of listNotificationKindDescriptors()) {
      const messages = getNotificationTemplate(desc.template);
      for (const locale of ["en", "fr"] as const) {
        const slot = messages?.[locale];
        expect(slot, `${desc.template} missing locale ${locale}`).toBeDefined();
        expect(slot?.subject.length, `${desc.template}/${locale} subject empty`).toBeGreaterThan(0);
        expect(
          slot?.inapp.subject.length,
          `${desc.template}/${locale} inapp subject empty`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("isKnownNotificationKind narrows correctly", () => {
    expect(isKnownNotificationKind("auth.new-device")).toBe(true);
    expect(isKnownNotificationKind("nope")).toBe(false);
    expect(isKnownNotificationKind("toString")).toBe(false);
  });

  it("getNotificationKindDef returns undefined for unknown kinds", () => {
    expect(getNotificationKindDef("nope")).toBeUndefined();
    expect(getNotificationKindDef("auth.new-device")).toBeDefined();
  });
});
