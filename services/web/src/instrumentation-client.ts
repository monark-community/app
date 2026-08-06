import * as Sentry from "@sentry/nextjs";

// Browser error tracking. A no-op unless NEXT_PUBLIC_SENTRY_DSN is set. This
// file runs in the client bundle before hydration (Next 15 client
// instrumentation hook).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // Session Replay is off by default (privacy + cost) ; opt in per-deployment.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}

// Instruments App Router client navigations for tracing (Next 15 hook).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
