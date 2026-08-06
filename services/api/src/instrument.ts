import * as Sentry from "@sentry/node";

// Server-side error tracking. A **no-op unless `SENTRY_DSN` is set**, so local
// dev and any deployment that hasn't opted in are completely unaffected —
// `Sentry.captureException` / the Express error handler simply do nothing when
// the SDK was never given a DSN.
//
// This module is imported as the FIRST thing in `server.ts` (before express /
// http / the tRPC stack) so Sentry's auto-instrumentation can wrap those
// modules as they initialise.
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    // Undefined is fine — Sentry falls back to auto-detecting the release.
    release: process.env.SENTRY_RELEASE,
    // Performance tracing is opt-in + sampled ; default 0 so switching on error
    // reporting doesn't silently turn on trace volume (and its cost).
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // This app carries auth tokens + PII in request headers / bodies / cookies ;
    // never attach them by default. Opt in per-deployment if a scrubbing policy
    // is in place.
    sendDefaultPii: false,
  });
}

/** Whether the Sentry SDK was initialised with a DSN this process. */
export const sentryEnabled = Boolean(dsn);
