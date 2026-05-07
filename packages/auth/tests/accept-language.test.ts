import { describe, expect, it } from "vitest"
import { pickLocaleFromHeader } from "../src/contracts/accept-language"

describe("auth/accept-language.pickLocaleFromHeader", () => {
  it("returns undefined for null/undefined/empty header", () => {
    expect(pickLocaleFromHeader(null)).toBeUndefined()
    expect(pickLocaleFromHeader(undefined)).toBeUndefined()
    expect(pickLocaleFromHeader("")).toBeUndefined()
  })

  it("returns the primary tag of an exact match", () => {
    expect(pickLocaleFromHeader("en")).toBe("en")
    expect(pickLocaleFromHeader("fr")).toBe("fr")
  })

  it("strips region subtags down to the supported primary tag", () => {
    expect(pickLocaleFromHeader("en-US")).toBe("en")
    expect(pickLocaleFromHeader("fr-CA")).toBe("fr")
  })

  it("returns undefined when no entry maps to a supported locale", () => {
    expect(pickLocaleFromHeader("pt-BR")).toBeUndefined()
    expect(pickLocaleFromHeader("de,es;q=0.7")).toBeUndefined()
  })

  it("ranks entries by q-weight, picking the highest supported", () => {
    // en is q=1 (default), fr is q=0.9 — en wins.
    expect(pickLocaleFromHeader("en;q=1,fr;q=0.9")).toBe("en")
    // fr is q=1 (default), en is q=0.5 — fr wins.
    expect(pickLocaleFromHeader("fr,en;q=0.5")).toBe("fr")
  })

  it("skips unsupported high-q entries to find supported ones", () => {
    // pt-BR is q=1 but unsupported, fr is q=0.7 and supported — fr wins.
    expect(pickLocaleFromHeader("pt-BR,fr;q=0.7,en;q=0.3")).toBe("fr")
  })

  it("treats malformed q values as default 1", () => {
    // The "q=abc" parse yields NaN which the helper coerces back to 1.
    expect(pickLocaleFromHeader("fr;q=abc,en;q=0.9")).toBe("fr")
  })

  it("matches case-insensitively (Accept-Language can be mixed case)", () => {
    expect(pickLocaleFromHeader("FR-ca")).toBe("fr")
    expect(pickLocaleFromHeader("EN-GB,DE;q=0.5")).toBe("en")
  })

  it("filters empty entries from sloppy headers", () => {
    expect(pickLocaleFromHeader(",,fr")).toBe("fr")
    expect(pickLocaleFromHeader("  ,  fr-CA  ,  ")).toBe("fr")
  })

  it("handles a realistic browser-style header", () => {
    expect(pickLocaleFromHeader("fr-CA,fr;q=0.9,en-US;q=0.8,en;q=0.7")).toBe("fr")
  })
})
