import { describe, expect, it } from "vitest"
import {
  isKnownNotificationKind,
  listNotificationKinds,
  NOTIFICATION_KINDS,
} from "../src/contracts/registry"
import { TEMPLATES } from "../src/templates"

describe("notifications/registry shape", () => {
  it("declares the Phase 1 set of kinds", () => {
    const kinds = listNotificationKinds()
    expect(kinds).toContain("auth.new-device")
    expect(kinds).toContain("auth.password-changed")
    expect(kinds).toContain("auth.totp-enabled")
    expect(kinds).toContain("auth.totp-disabled")
    expect(kinds).toContain("account.email-changed")
    expect(kinds).toContain("account.deletion-scheduled")
    expect(kinds).toContain("account.deletion-canceled")
  })

  it("requires email for every SECURITY-category kind", () => {
    for (const [kind, def] of Object.entries(NOTIFICATION_KINDS)) {
      if (def.category === "SECURITY") {
        expect(def.requiredEmail, `${kind} should set requiredEmail`).toBe(true)
      }
    }
  })

  it("every kind's template has a registered TEMPLATES entry", () => {
    for (const [kind, def] of Object.entries(NOTIFICATION_KINDS)) {
      expect(TEMPLATES[def.template], `template missing for ${kind}`).toBeDefined()
    }
  })

  it("every template has en + fr slots with a non-empty inapp.subject", () => {
    for (const [path, messages] of Object.entries(TEMPLATES)) {
      for (const locale of ["en", "fr"] as const) {
        const slot = messages[locale]
        expect(slot, `${path} missing locale ${locale}`).toBeDefined()
        expect(slot.subject.length, `${path}/${locale} subject empty`).toBeGreaterThan(0)
        expect(
          slot.inapp.subject.length,
          `${path}/${locale} inapp subject empty`,
        ).toBeGreaterThan(0)
      }
    }
  })

  it("isKnownNotificationKind narrows correctly", () => {
    expect(isKnownNotificationKind("auth.new-device")).toBe(true)
    expect(isKnownNotificationKind("nope")).toBe(false)
    expect(isKnownNotificationKind("toString")).toBe(false)
  })
})
