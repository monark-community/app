import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyHmacSha256 } from "../src/server/webhook";

const secret = "s3cr3t";
const body = Buffer.from(JSON.stringify({ hello: "world" }));
const sign = (b: Buffer, s: string, prefix = "") =>
  `${prefix}${createHmac("sha256", s).update(b).digest("hex")}`;

describe("verifyHmacSha256", () => {
  it("accepts a valid signature (no prefix)", () => {
    expect(verifyHmacSha256(body, secret, sign(body, secret))).toBe(true);
  });
  it("accepts a valid prefixed signature (GitHub style)", () => {
    const sig = sign(body, secret, "sha256=");
    expect(verifyHmacSha256(body, secret, sig, { prefix: "sha256=" })).toBe(true);
  });
  it("rejects a wrong secret", () => {
    expect(verifyHmacSha256(body, secret, sign(body, "other"))).toBe(false);
  });
  it("rejects a tampered body", () => {
    const sig = sign(body, secret);
    expect(verifyHmacSha256(Buffer.from("{}"), secret, sig)).toBe(false);
  });
  it("rejects a missing signature", () => {
    expect(verifyHmacSha256(body, secret, null)).toBe(false);
  });
  it("rejects a length mismatch without throwing", () => {
    expect(verifyHmacSha256(body, secret, "sha256=short")).toBe(false);
  });
});
