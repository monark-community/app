/**
 * Per-user, per-minute cap on TOTP verify attempts. In-memory by design;
 * single-process Phase 1. Exposed as its own module so the unit suite can
 * exercise the sliding-window logic without importing Prisma / Supabase.
 *
 * Time source is injectable for deterministic tests; production callers
 * pass `Date.now()` (default).
 */

export const TOTP_VERIFY_MAX_PER_MINUTE = 5;

const attempts = new Map<string, number[]>();

export type RateLimitResult = { allowed: boolean; remaining: number };

export function recordVerifyAttempt(userId: string, now: number = Date.now()): RateLimitResult {
  const cutoff = now - 60_000;
  const history = (attempts.get(userId) ?? []).filter((ts) => ts > cutoff);
  if (history.length >= TOTP_VERIFY_MAX_PER_MINUTE) {
    attempts.set(userId, history);
    return { allowed: false, remaining: 0 };
  }
  history.push(now);
  attempts.set(userId, history);
  return { allowed: true, remaining: TOTP_VERIFY_MAX_PER_MINUTE - history.length };
}

/** Test-only helper. Resets the in-memory window so suites stay isolated. */
export function _resetTotpRateLimitForTesting(): void {
  attempts.clear();
}

export class TotpRateLimitError extends Error {
  constructor() {
    super("Too many TOTP attempts. Wait a minute and try again.");
    this.name = "TotpRateLimitError";
  }
}
