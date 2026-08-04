import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mintEmailActionToken, verifyEmailActionToken } from "../src/server/email-action-token";

// HMAC-signed one-time email-action tokens (the "revoke this device" link).
// Pure crypto with `secret` + `now` overrides, so no DB / clock flakiness.
// Threat model the tests pin: unforgeable without the secret, expiry enforced,
// purpose + owner encoded, tamper-evident, constant-time-compare failure mode.

const SECRET = "test-email-action-secret-0123456789";
const NOW = 1_700_000_000_000; // fixed clock (ms)

// Replicate the module's sign() to craft tokens that pass signature but fail
// later checks (bad JSON / missing fields / wrong purpose) — sign() isn't
// exported, and these branches sit after the signature gate.
function sign(payload: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
function craft(body: unknown, secret = SECRET): string {
  const payload = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

const mint = (over: Partial<Parameters<typeof mintEmailActionToken>[0]> = {}) =>
  mintEmailActionToken({
    purpose: "revoke-device",
    userId: "u1",
    deviceId: "d1",
    secret: SECRET,
    now: NOW,
    ...over,
  });

describe("mint + verify round-trip", () => {
  it("verifies a freshly minted token and returns the encoded ids", () => {
    const token = mint();
    const result = verifyEmailActionToken({
      token,
      expectedPurpose: "revoke-device",
      secret: SECRET,
      now: NOW + 1000,
    });
    expect(result).toEqual({ ok: true, userId: "u1", deviceId: "d1" });
  });

  it("honors a custom ttl", () => {
    const token = mint({ ttlMs: 60_000 });
    // 30s in → valid.
    expect(
      verifyEmailActionToken({
        token,
        expectedPurpose: "revoke-device",
        secret: SECRET,
        now: NOW + 30_000,
      }).ok,
    ).toBe(true);
    // 61s in → expired.
    const late = verifyEmailActionToken({
      token,
      expectedPurpose: "revoke-device",
      secret: SECRET,
      now: NOW + 61_000,
    });
    expect(late).toEqual({ ok: false, reason: "expired" });
  });
});

describe("failure modes", () => {
  it("rejects an expired token", () => {
    const token = mint({ ttlMs: 1000 });
    const result = verifyEmailActionToken({
      token,
      expectedPurpose: "revoke-device",
      secret: SECRET,
      now: NOW + 2000,
    });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token signed with a different secret", () => {
    const token = mint();
    const result = verifyEmailActionToken({
      token,
      expectedPurpose: "revoke-device",
      secret: "another-secret",
      now: NOW + 1000,
    });
    expect(result).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const token = mint();
    const [, sig] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ p: "revoke-device", u: "attacker", d: "d1", e: 9_999_999_999 }),
      "utf8",
    ).toString("base64url");
    const result = verifyEmailActionToken({
      token: `${forgedPayload}.${sig}`,
      expectedPurpose: "revoke-device",
      secret: SECRET,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a tampered signature", () => {
    const token = mint();
    const [payload] = token.split(".");
    const result = verifyEmailActionToken({
      token: `${payload}.${sign("different", SECRET)}`,
      expectedPurpose: "revoke-device",
      secret: SECRET,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a purpose mismatch", () => {
    // Validly signed, but a different purpose than the verifier expects.
    const token = craft({ p: "unsubscribe", u: "u1", d: "d1", e: Math.floor(NOW / 1000) + 999 });
    const result = verifyEmailActionToken({
      token,
      expectedPurpose: "revoke-device",
      secret: SECRET,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "wrong-purpose" });
  });

  it("rejects malformed shapes", () => {
    const v = (token: string) =>
      verifyEmailActionToken({ token, expectedPurpose: "revoke-device", secret: SECRET, now: NOW })
        .ok;
    // No dot / trailing dot / leading dot.
    expect(v("no-dot-here")).toBe(false);
    expect(v("payloadonly.")).toBe(false);
    expect(v(".sigonly")).toBe(false);
    // Validly signed but not JSON.
    const notJson = "bm90LWpzb24"; // base64url("not-json")
    expect(v(`${notJson}.${sign(notJson)}`)).toBe(false);
    // Validly signed JSON but missing required fields.
    expect(v(craft({ p: "revoke-device", u: "u1" }))).toBe(false);
  });
});
