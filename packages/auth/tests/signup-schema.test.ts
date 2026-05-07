import { describe, expect, it } from "vitest"
import { signUpInputSchema } from "../src/server/signup"

describe("auth/signup.signUpInputSchema", () => {
  it("accepts a minimal valid payload (email + 12+ char password)", () => {
    const result = signUpInputSchema.safeParse({
      email: "user@example.com",
      password: "Tg7!hP9q*xLb",
    })
    expect(result.success).toBe(true)
  })

  it("accepts a full valid payload (with displayName, referral, locale)", () => {
    const result = signUpInputSchema.safeParse({
      email: "user@example.com",
      password: "Tg7!hP9q*xLb2nJv",
      displayName: "Dominic",
      referralCode: "INVITE-42",
      localePreference: "fr",
    })
    expect(result.success).toBe(true)
  })

  it("rejects an invalid email", () => {
    const result = signUpInputSchema.safeParse({
      email: "not-an-email",
      password: "Tg7!hP9q*xLb",
    })
    expect(result.success).toBe(false)
  })

  it("rejects passwords shorter than 12 chars", () => {
    const result = signUpInputSchema.safeParse({
      email: "user@example.com",
      password: "short11char",
    })
    expect(result.success).toBe(false)
  })

  it("rejects an empty displayName but accepts an absent one", () => {
    const tooShort = signUpInputSchema.safeParse({
      email: "user@example.com",
      password: "Tg7!hP9q*xLb",
      displayName: "",
    })
    expect(tooShort.success).toBe(false)

    const absent = signUpInputSchema.safeParse({
      email: "user@example.com",
      password: "Tg7!hP9q*xLb",
    })
    expect(absent.success).toBe(true)
  })

  it("rejects displayName longer than 80 chars", () => {
    const result = signUpInputSchema.safeParse({
      email: "user@example.com",
      password: "Tg7!hP9q*xLb",
      displayName: "x".repeat(81),
    })
    expect(result.success).toBe(false)
  })

  it("rejects unsupported locale tags", () => {
    const result = signUpInputSchema.safeParse({
      email: "user@example.com",
      password: "Tg7!hP9q*xLb",
      localePreference: "pt",
    })
    expect(result.success).toBe(false)
  })

  it("accepts both supported locale tags individually", () => {
    for (const tag of ["en", "fr"] as const) {
      const result = signUpInputSchema.safeParse({
        email: "user@example.com",
        password: "Tg7!hP9q*xLb",
        localePreference: tag,
      })
      expect(result.success).toBe(true)
    }
  })

  it("strips unknown fields without failing (zod default behavior)", () => {
    const result = signUpInputSchema.safeParse({
      email: "user@example.com",
      password: "Tg7!hP9q*xLb",
      // @ts-expect-error — extra field
      hijack: "ignored",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect("hijack" in result.data).toBe(false)
    }
  })
})
