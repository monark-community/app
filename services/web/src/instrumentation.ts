import * as Sentry from "@sentry/nextjs";

// Server + edge error tracking for the web app. A no-op unless
// NEXT_PUBLIC_SENTRY_DSN is set, so local dev and non-opted-in deployments are
// unaffected. Next calls `register()` once per server runtime at startup.
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  const runtime = process.env.NEXT_RUNTIME;
  if (runtime === "nodejs" || runtime === "edge") {
    Sentry.init({
      dsn,
      environment:
        process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
      sendDefaultPii: false,
    });
  }
}

// Reports server-render + route-handler errors to Sentry (Next 15 hook).
export const onRequestError = Sentry.captureRequestError;
