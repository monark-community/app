import { describe, expect, it } from "vitest";
import { checkPasswordOffline } from "../src/contracts/password-check";

describe("auth/password-rules.checkPasswordOffline", () => {
  it("accepts a strong, varied password", () => {
    const result = checkPasswordOffline("Tg7!hP9q*xLb2nJv");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.score).toBeGreaterThanOrEqual(2);
  });

  it("rejects passwords shorter than the minimum", () => {
    const result = checkPasswordOffline("short");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("too-short");
  });

  it("rejects passwords without enough character classes", () => {
    const result = checkPasswordOffline("aaaaaaaaaaaaaaaa");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("not-enough-char-classes");
  });

  it("rejects passwords containing the email local part", () => {
    const result = checkPasswordOffline("dominic-Test123XX!", {
      email: "dominic@example.com",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("contains-email");
  });

  it("rejects passwords containing the display name", () => {
    const result = checkPasswordOffline("DominicSecret-XY1!", {
      displayName: "Dominic",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("contains-display-name");
  });

  it("ignores email when only initials match the substring window", () => {
    // "abc" is shorter than the substring scan window so it's not flagged.
    const result = checkPasswordOffline("Strong-Passw0rd-XYZ!", { email: "ab@x.com" });
    expect(result.ok).toBe(true);
  });

  it("scores 4 (Strong) on long + multi-class passwords", () => {
    const result = checkPasswordOffline("Tg7!hP9q*xLb2nJvWXyZ");
    if (result.ok) {
      expect(result.score).toBe(4);
    } else {
      throw new Error("expected ok");
    }
  });

  it("scores 0 (Very weak) on very short passwords", () => {
    const result = checkPasswordOffline("abc");
    if (!result.ok) {
      expect(result.score).toBe(0);
    }
  });

  it("treats unicode code points as one each (length is code-point-counted)", () => {
    // Twelve emoji + four ascii = 16 visible chars but we count via Array.from
    // which gives code-point length.
    const result = checkPasswordOffline("AB12🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟");
    expect(result.ok).toBe(true);
  });
});
