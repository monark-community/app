// Pure helper extracted from `server.ts` so the cron-secret guard
// can be unit-tested without spinning up Express. The HTTP bridge
// in server.ts maps the result to status codes :
//   "not-configured" → 503
//   "unauthorized"   → 401
//   "ok"             → continue.

export type CronAuthResult =
  | { ok: true }
  | { ok: false; reason: "not-configured" | "unauthorized" };

export function evaluateCronAuth(input: {
  authorizationHeader: string | undefined | null;
  cronSecret: string | undefined | null;
}): CronAuthResult {
  if (!input.cronSecret) return { ok: false, reason: "not-configured" };
  const expected = `Bearer ${input.cronSecret}`;
  if ((input.authorizationHeader ?? "") !== expected) {
    return { ok: false, reason: "unauthorized" };
  }
  return { ok: true };
}
