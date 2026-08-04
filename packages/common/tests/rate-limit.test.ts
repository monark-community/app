import { describe, expect, it } from "vitest";
import { stepTokenBucket, type BucketState, type RateLimitOptions } from "../src/rate-limit";

// Pure token-bucket math — no DB. The Postgres store's read-modify-write is
// exercised by the public-api integration suite ; here we lock the algorithm.

const OPTS: RateLimitOptions = { refillPerSecond: 2, burst: 10 };

describe("stepTokenBucket", () => {
  it("treats a never-seen key as a full bucket and admits the first request", () => {
    const { state, result } = stepTokenBucket(null, OPTS, 1_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.limit).toBe(10);
    expect(state.tokens).toBe(9);
  });

  it("spends a token per accepted request until the burst is exhausted", () => {
    let state: BucketState | null = null;
    let last;
    for (let i = 0; i < 10; i++) {
      const step = stepTokenBucket(state, OPTS, 1_000);
      state = step.state;
      last = step.result;
    }
    // 10 requests at the same instant drain the burst of 10.
    expect(last?.allowed).toBe(true);
    expect(last?.remaining).toBe(0);
    // The 11th at the same instant is denied.
    const denied = stepTokenBucket(state, OPTS, 1_000);
    expect(denied.result.allowed).toBe(false);
    expect(denied.result.remaining).toBe(0);
  });

  it("reports how long to wait when denied", () => {
    const empty: BucketState = { tokens: 0, updatedAtMs: 1_000 };
    const { result } = stepTokenBucket(empty, OPTS, 1_000);
    expect(result.allowed).toBe(false);
    // Need 1 token, refilling at 2/sec => 500ms.
    expect(result.retryAfterMs).toBe(500);
  });

  it("refills lazily based on elapsed time, capped at the burst", () => {
    const empty: BucketState = { tokens: 0, updatedAtMs: 1_000 };
    // 3 seconds later at 2/sec => 6 tokens accrued.
    const after3s = stepTokenBucket(empty, OPTS, 4_000);
    expect(after3s.result.allowed).toBe(true);
    expect(after3s.state.tokens).toBe(5); // 6 refilled - 1 spent

    // A long idle refills only up to the burst ceiling, never beyond.
    const afterLongIdle = stepTokenBucket(empty, OPTS, 1_000_000);
    expect(afterLongIdle.state.tokens).toBe(9); // capped at 10, minus 1 spent
  });

  it("advances the refill clock even on a denied request", () => {
    const empty: BucketState = { tokens: 0, updatedAtMs: 1_000 };
    const denied = stepTokenBucket(empty, OPTS, 1_200);
    expect(denied.result.allowed).toBe(false);
    // updatedAt moved forward so the next call accrues from 1_200, not 1_000.
    expect(denied.state.updatedAtMs).toBe(1_200);
  });
});
