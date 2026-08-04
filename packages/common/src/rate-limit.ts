import { getDb } from "@monark/db";

// A shared, storage-agnostic **token-bucket** rate limiter. The bucket refills
// at `refillPerSecond` up to a ceiling of `burst` ; each accepted request
// spends `cost` tokens (default 1). A caller that runs out is told how long to
// wait (`retryAfterMs`).
//
// The pure step function (`stepTokenBucket`) holds all the math and is
// dependency-free, so it is unit-testable without a database ; the default
// store (`createPostgresRateLimitStore`) persists one row per key in the
// `RateLimitBucket` table so the limit is shared across every api replica (the
// stack has no Redis). Swap the store via `setRateLimitStore` (e.g. an
// in-memory store in tests, or Redis later) without touching call sites.

export interface RateLimitOptions {
  /** Sustained rate : tokens added to the bucket per second. */
  refillPerSecond: number;
  /** Bucket capacity : the largest burst allowed after an idle period. */
  burst: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Whole tokens left in the bucket after this call. */
  remaining: number;
  /** Milliseconds until enough tokens refill to retry ; 0 when allowed. */
  retryAfterMs: number;
  /** The bucket capacity, echoed for an `X-RateLimit-Limit` header. */
  limit: number;
}

export interface BucketState {
  tokens: number;
  updatedAtMs: number;
}

// The whole algorithm, as a pure function : given the previous bucket state
// (or null for a never-seen key), lazily refill for the elapsed time, then
// decide. Returns the next state to persist alongside the result. No clock,
// no I/O — `nowMs` is passed in so tests are deterministic.
export function stepTokenBucket(
  prev: BucketState | null,
  opts: RateLimitOptions,
  nowMs: number,
  cost = 1,
): { state: BucketState; result: RateLimitResult } {
  const { refillPerSecond, burst } = opts;

  let tokens = burst;
  if (prev) {
    const elapsedSec = Math.max(0, (nowMs - prev.updatedAtMs) / 1000);
    tokens = Math.min(burst, prev.tokens + elapsedSec * refillPerSecond);
  }

  if (tokens < cost) {
    const retryAfterMs =
      refillPerSecond > 0 ? Math.ceil(((cost - tokens) / refillPerSecond) * 1000) : Infinity;
    // Persist the refilled (but unspent) tokens so the refill clock advances
    // even on a denied request — otherwise a client hammering the endpoint
    // would keep resetting `updatedAt` and never accrue tokens.
    return {
      state: { tokens, updatedAtMs: nowMs },
      result: {
        allowed: false,
        remaining: Math.floor(Math.max(0, tokens)),
        retryAfterMs,
        limit: burst,
      },
    };
  }

  const remaining = tokens - cost;
  return {
    state: { tokens: remaining, updatedAtMs: nowMs },
    result: { allowed: true, remaining: Math.floor(remaining), retryAfterMs: 0, limit: burst },
  };
}

export interface RateLimitStore {
  consume(
    key: string,
    opts: RateLimitOptions,
    nowMs: number,
    cost: number,
  ): Promise<RateLimitResult>;
}

// Default store : one `RateLimitBucket` row per key, read-modify-written inside
// a transaction so concurrent requests on the same key serialize. Under the
// default read-committed isolation two racing requests can each read the same
// pre-decrement row and both be allowed, over-admitting by at most the
// concurrency ; for coarse abuse-prevention limits that is acceptable, and the
// store can be swapped for a stricter one (`SELECT … FOR UPDATE`, Redis) later.
export function createPostgresRateLimitStore(): RateLimitStore {
  return {
    async consume(key, opts, nowMs, cost) {
      return getDb().$transaction(async (tx) => {
        const row = await tx.rateLimitBucket.findUnique({ where: { key } });
        const prev: BucketState | null = row
          ? { tokens: row.tokens, updatedAtMs: row.updatedAt.getTime() }
          : null;
        const { state, result } = stepTokenBucket(prev, opts, nowMs, cost);
        const updatedAt = new Date(state.updatedAtMs);
        await tx.rateLimitBucket.upsert({
          where: { key },
          create: { key, tokens: state.tokens, updatedAt },
          update: { tokens: state.tokens, updatedAt },
        });
        return result;
      });
    },
  };
}

let activeStore: RateLimitStore | null = null;

export function getRateLimitStore(): RateLimitStore {
  return (activeStore ??= createPostgresRateLimitStore());
}

/** Swap the backing store (tests, or a future Redis store). Pass null to reset. */
export function setRateLimitStore(store: RateLimitStore | null): void {
  activeStore = store;
}

/**
 * Spend `cost` tokens from the bucket named `key`. Resolves to whether the
 * request is allowed plus the headers' worth of metadata. `nowMs` is injectable
 * for tests ; production passes the wall clock.
 */
export async function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
  cost = 1,
  nowMs: number = Date.now(),
): Promise<RateLimitResult> {
  return getRateLimitStore().consume(key, opts, nowMs, cost);
}
