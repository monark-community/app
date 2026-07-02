import { afterEach, describe, expect, it } from "vitest";
import {
  recordVerifyAttempt,
  TotpRateLimitError,
  TOTP_VERIFY_MAX_PER_MINUTE,
  _resetTotpRateLimitForTesting,
} from "../src/server/totp-rate-limit";

afterEach(() => {
  _resetTotpRateLimitForTesting();
});

describe("auth/totp-rate-limit.recordVerifyAttempt", () => {
  it("allows the first attempt with full budget remaining minus one", () => {
    const result = recordVerifyAttempt("user-a", 1_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(TOTP_VERIFY_MAX_PER_MINUTE - 1);
  });

  it("decrements remaining on each subsequent attempt", () => {
    const t = 10_000;
    for (let i = 1; i <= TOTP_VERIFY_MAX_PER_MINUTE; i++) {
      const result = recordVerifyAttempt("user-a", t + i);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(TOTP_VERIFY_MAX_PER_MINUTE - i);
    }
  });

  it("blocks the (cap+1)th attempt with remaining=0", () => {
    const t = 10_000;
    for (let i = 1; i <= TOTP_VERIFY_MAX_PER_MINUTE; i++) {
      recordVerifyAttempt("user-a", t + i);
    }
    const blocked = recordVerifyAttempt("user-a", t + 100);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("only re-allows after older attempts age out of the 60s window", () => {
    const t = 10_000;
    for (let i = 1; i <= TOTP_VERIFY_MAX_PER_MINUTE; i++) {
      recordVerifyAttempt("user-a", t + i);
    }
    // Still inside the window — blocked.
    expect(recordVerifyAttempt("user-a", t + 30_000).allowed).toBe(false);
    // 60s + 1ms after the FIRST attempt — first attempt drops out, allowing one slot.
    const reopened = recordVerifyAttempt("user-a", t + 1 + 60_000 + 1);
    expect(reopened.allowed).toBe(true);
  });

  it("scopes the cap per user", () => {
    const t = 10_000;
    for (let i = 1; i <= TOTP_VERIFY_MAX_PER_MINUTE; i++) {
      recordVerifyAttempt("user-a", t + i);
    }
    // user-b should have a fresh budget
    expect(recordVerifyAttempt("user-b", t + 10).allowed).toBe(true);
  });

  it("uses Date.now() by default", () => {
    const before = Date.now();
    const result = recordVerifyAttempt("user-default-time");
    const after = Date.now();
    expect(result.allowed).toBe(true);
    // Shouldn't matter what the actual timestamp was; just confirms the
    // overload accepts the default and doesn't throw.
    expect(after - before).toBeGreaterThanOrEqual(0);
  });

  it("doesn't grow history past the window when called many times", () => {
    // Drive ~20 attempts spaced 30s apart — window only ever holds 2.
    let t = 10_000;
    for (let i = 0; i < 20; i++) {
      recordVerifyAttempt("user-a", t);
      t += 30_000;
    }
    // After many spaced attempts, the LAST minute should hold at most 2,
    // so a fresh attempt is still allowed.
    const next = recordVerifyAttempt("user-a", t);
    expect(next.allowed).toBe(true);
  });
});

describe("auth/totp-rate-limit.TotpRateLimitError", () => {
  it("has the expected name + message shape for catchers to branch on", () => {
    const err = new TotpRateLimitError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TotpRateLimitError);
    expect(err.name).toBe("TotpRateLimitError");
    expect(err.message).toMatch(/too many totp/i);
  });
});
