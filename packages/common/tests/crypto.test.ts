import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt, loadEncryptionKey, timingSafeEqualHex } from "../src/crypto";

// AES-256-GCM primitive shared by the TOTP + org-secrets stores. Verifies the
// round-trip, that a wrong key / tampered payload fails closed, and the
// env-var key loader's validation.

const KEY = randomBytes(32);

describe("encrypt + decrypt", () => {
  it("round-trips a value", () => {
    const enc = encrypt("s3cr3t-token", KEY);
    expect(decrypt(enc, KEY)).toBe("s3cr3t-token");
  });

  it("produces a distinct IV each call (non-deterministic ciphertext)", () => {
    const a = encrypt("same input", KEY);
    const b = encrypt("same input", KEY);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.cipher.equals(b.cipher)).toBe(false);
  });

  it("throws when decrypting with the wrong key", () => {
    const enc = encrypt("payload", KEY);
    expect(() => decrypt(enc, randomBytes(32))).toThrow();
  });

  it("throws when the auth tag is tampered", () => {
    const enc = encrypt("payload", KEY);
    const tampered = { ...enc, tag: Buffer.from(enc.tag).fill(0) };
    expect(() => decrypt(tampered, KEY)).toThrow();
  });

  it("throws when the ciphertext is tampered", () => {
    const enc = encrypt("payload", KEY);
    const tampered = { ...enc, cipher: Buffer.from(enc.cipher).fill(0) };
    expect(() => decrypt(tampered, KEY)).toThrow();
  });
});

describe("loadEncryptionKey", () => {
  const ENV = "TEST_CRYPTO_KEY";
  const original = process.env[ENV];
  beforeEach(() => {
    delete process.env[ENV];
  });
  afterEach(() => {
    if (original === undefined) delete process.env[ENV];
    else process.env[ENV] = original;
  });

  it("throws (naming the var) when unset", () => {
    expect(() => loadEncryptionKey(ENV)).toThrow(/TEST_CRYPTO_KEY/);
  });

  it("throws when not 32 bytes", () => {
    process.env[ENV] = randomBytes(16).toString("hex");
    expect(() => loadEncryptionKey(ENV)).toThrow(/32 bytes/);
  });

  it("returns a 32-byte key for a valid value", () => {
    process.env[ENV] = KEY.toString("hex");
    expect(loadEncryptionKey(ENV).equals(KEY)).toBe(true);
  });
});

describe("timingSafeEqualHex", () => {
  it("true for equal hex", () => {
    expect(timingSafeEqualHex("deadbeef", "deadbeef")).toBe(true);
  });
  it("false for different hex", () => {
    expect(timingSafeEqualHex("deadbeef", "feedface")).toBe(false);
  });
  it("false for different length", () => {
    expect(timingSafeEqualHex("dead", "deadbeef")).toBe(false);
  });
});
