import { describe, expect, it } from "vitest"
import { FLAGS, isKnownFlag, listFlagKeys } from "../src/contracts/flags"

describe("feature-flags/flags.FLAGS", () => {
  it("exposes the auth subsystem flags with the expected defaults", () => {
    // These three are load-bearing — the auth UX assumes they default ON,
    // so a regression here would silently disable trusted devices /
    // skip-on-recognized / admin TOTP enforcement.
    expect(FLAGS["auth.trusted-devices"].defaultOn).toBe(true)
    expect(FLAGS["auth.totp-trust-devices"].defaultOn).toBe(true)
    expect(FLAGS["auth.totp-required-admin"].defaultOn).toBe(true)
  })

  it("keeps tenancy off by default (single-tenant is the starter mode)", () => {
    expect(FLAGS["tenancy.multi-tenant"].defaultOn).toBe(false)
  })

  it("every flag has a non-empty description (so the admin UI shows context)", () => {
    for (const [key, def] of Object.entries(FLAGS)) {
      expect(def.description.length, `flag ${key} has empty description`)
        .toBeGreaterThan(0)
    }
  })
})

describe("feature-flags/flags.isKnownFlag", () => {
  it("returns true for declared flag keys", () => {
    expect(isKnownFlag("auth.trusted-devices")).toBe(true)
    expect(isKnownFlag("auth.totp-required-admin")).toBe(true)
    expect(isKnownFlag("tenancy.multi-tenant")).toBe(true)
  })

  it("returns false for unknown keys (including empty string and prototype hits)", () => {
    expect(isKnownFlag("nope")).toBe(false)
    expect(isKnownFlag("")).toBe(false)
    expect(isKnownFlag("toString")).toBe(false)
    expect(isKnownFlag("hasOwnProperty")).toBe(false)
    expect(isKnownFlag("__proto__")).toBe(false)
  })

  it("narrows the type of the input on success (compile-time check)", () => {
    const candidate: string = "auth.trusted-devices"
    if (isKnownFlag(candidate)) {
      // If this compiles, the narrowing works. The runtime value is also fine.
      expect(FLAGS[candidate].defaultOn).toBe(true)
    } else {
      throw new Error("expected `auth.trusted-devices` to be known")
    }
  })
})

describe("feature-flags/flags.listFlagKeys", () => {
  it("returns every key in FLAGS, in declaration order", () => {
    const keys = listFlagKeys()
    expect(keys).toEqual(Object.keys(FLAGS))
  })

  it("includes the three auth flags", () => {
    const keys = listFlagKeys()
    expect(keys).toContain("auth.trusted-devices")
    expect(keys).toContain("auth.totp-trust-devices")
    expect(keys).toContain("auth.totp-required-admin")
  })
})
