import { randomBytes } from "node:crypto"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { decryptSecret, encryptSecret, timingSafeEqualHex } from "../src/server/crypto"

const ORIGINAL_KEY = process.env.TOTP_ENCRYPTION_KEY

beforeAll(() => {
  process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("hex")
})

afterEach(() => {
  process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("hex")
})

describe("auth/crypto", () => {
  describe("encryptSecret + decryptSecret", () => {
    it("round-trips a TOTP base32 secret", () => {
      const plaintext = "JBSWY3DPEHPK3PXP"
      const enc = encryptSecret(plaintext)
      expect(enc.cipher.length).toBeGreaterThan(0)
      expect(enc.iv.length).toBe(12)
      expect(enc.tag.length).toBe(16)
      const back = decryptSecret(enc)
      expect(back).toBe(plaintext)
    })

    it("produces a different IV each call", () => {
      const a = encryptSecret("same input")
      const b = encryptSecret("same input")
      expect(a.iv.equals(b.iv)).toBe(false)
      expect(a.cipher.equals(b.cipher)).toBe(false)
    })

    it("decrypt fails when the auth tag is tampered", () => {
      const enc = encryptSecret("payload")
      const tampered = {
        ...enc,
        tag: Buffer.from(enc.tag).map((b) => b ^ 0xff),
      }
      expect(() => decryptSecret(tampered)).toThrow()
    })

    it("decrypt fails when the ciphertext is tampered", () => {
      const enc = encryptSecret("payload")
      const tampered = {
        ...enc,
        cipher: Buffer.from(enc.cipher).map((b) => b ^ 0xff),
      }
      expect(() => decryptSecret(tampered)).toThrow()
    })

    it("rejects when TOTP_ENCRYPTION_KEY is missing", () => {
      const previous = process.env.TOTP_ENCRYPTION_KEY
      delete process.env.TOTP_ENCRYPTION_KEY
      try {
        expect(() => encryptSecret("x")).toThrow(/TOTP_ENCRYPTION_KEY/)
      } finally {
        process.env.TOTP_ENCRYPTION_KEY = previous
      }
    })

    it("rejects a key of the wrong byte length", () => {
      const previous = process.env.TOTP_ENCRYPTION_KEY
      process.env.TOTP_ENCRYPTION_KEY = "deadbeef"
      try {
        expect(() => encryptSecret("x")).toThrow(/32 bytes/)
      } finally {
        process.env.TOTP_ENCRYPTION_KEY = previous
      }
    })
  })

  describe("timingSafeEqualHex", () => {
    it("returns true on equal inputs", () => {
      const a = "deadbeef"
      const b = "deadbeef"
      expect(timingSafeEqualHex(a, b)).toBe(true)
    })

    it("returns false on different inputs of equal length", () => {
      expect(timingSafeEqualHex("deadbeef", "feedface")).toBe(false)
    })

    it("returns false on inputs of different length without throwing", () => {
      expect(timingSafeEqualHex("dead", "deadbeef")).toBe(false)
    })
  })
})

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.TOTP_ENCRYPTION_KEY
  } else {
    process.env.TOTP_ENCRYPTION_KEY = ORIGINAL_KEY
  }
})
