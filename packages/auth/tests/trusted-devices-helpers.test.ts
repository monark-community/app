import { describe, expect, it } from "vitest";
import {
  hashCookieValue,
  labelFromUserAgent,
  mintCookieValue,
} from "../src/server/trusted-devices";

describe("auth/trusted-devices.hashCookieValue", () => {
  it("returns the SHA-256 hex of the input", () => {
    // Known SHA-256("hello") for sanity.
    expect(hashCookieValue("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("is deterministic for the same input", () => {
    const a = hashCookieValue("same-input-string");
    const b = hashCookieValue("same-input-string");
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", () => {
    expect(hashCookieValue("a")).not.toBe(hashCookieValue("b"));
  });

  it("returns 64 hex characters (32 bytes)", () => {
    expect(hashCookieValue("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("auth/trusted-devices.mintCookieValue", () => {
  it("returns base64url-safe characters only", () => {
    const value = mintCookieValue();
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces a different value on each call (HKDF-grade randomness)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(mintCookieValue());
    expect(seen.size).toBe(50);
  });

  it("encodes 32 bytes — base64url length without padding is 43 chars", () => {
    expect(mintCookieValue()).toHaveLength(43);
  });
});

describe("auth/trusted-devices.labelFromUserAgent", () => {
  it("formats a Chrome-on-macOS UA as 'Chrome on macOS'", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(labelFromUserAgent(ua)).toBe("Chrome on macOS");
  });

  it("formats a Safari-on-iOS UA as 'Mobile Safari on iOS' (whatever ua-parser produces)", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const label = labelFromUserAgent(ua);
    expect(label).toMatch(/Safari/);
    expect(label).toMatch(/iOS/);
  });

  it("formats a Firefox-on-Linux UA as 'Firefox on <Linux>'", () => {
    const ua = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0";
    const label = labelFromUserAgent(ua);
    expect(label).toMatch(/^Firefox on /);
  });

  it("falls back to 'Unknown device' on a totally unparsed UA", () => {
    expect(labelFromUserAgent("")).toBe("Unknown device");
    expect(labelFromUserAgent("not-a-real-user-agent")).toBe("Unknown device");
  });
});
