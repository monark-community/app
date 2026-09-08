# Observability : error tracking (Sentry)

Both services report unhandled errors to [Sentry](https://sentry.io) when a DSN
is configured. Everything is **gated on a DSN environment variable**: with no
DSN set, the SDK is never initialised and every capture call is a no-op, so
local development and any deployment that hasn't opted in are completely
unaffected. There is no feature flag ; the presence of the DSN is the switch.

## What's wired

### API (`services/api`, `@sentry/node`)

- [`src/instrument.ts`](../../services/api/src/instrument.ts) calls `Sentry.init`
  only when `SENTRY_DSN` is set. It is imported as the **very first** line of
  [`src/server.ts`](../../services/api/src/server.ts) so Sentry's
  auto-instrumentation wraps `http` / `express` before they initialise.
- Unhandled errors from the **raw Express routes** (`/cron/*`, `/hooks/*`,
  `/chat/stream`) are caught by `Sentry.setupExpressErrorHandler(app)`.
- **tRPC** errors never reach Express (the adapter handles them), so the tRPC
  `onError` hook reports the unexpected ones itself ; client-class errors
  (`UNAUTHORIZED`, `NOT_FOUND`, `BAD_REQUEST`, …) are deliberately **not** sent,
  only genuine server failures, tagged with the procedure + code.

### Web (`services/web`, `@sentry/nextjs`)

- [`src/instrumentation.ts`](../../services/web/src/instrumentation.ts) inits the
  SDK on the Node + Edge server runtimes and exposes `onRequestError` for
  server-render / route-handler failures.
- [`src/instrumentation-client.ts`](../../services/web/src/instrumentation-client.ts)
  inits the browser SDK and instruments App-Router navigations.
- [`next.config.ts`](../../services/web/next.config.ts) wraps the build with
  `withSentryConfig`. Browser events are routed through a **same-origin tunnel**
  (`tunnelRoute: "/monitoring"`) so the app's Content-Security-Policy
  (`connect-src 'self'`) covers them and ad-blockers don't drop them ; no CSP
  change needed.

## Configuration

| Variable                                                              | Side      | Effect                                                                                                                     |
| --------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `SENTRY_DSN`                                                          | api       | Turns on server error reporting. Unset = no-op.                                                                            |
| `NEXT_PUBLIC_SENTRY_DSN`                                              | web       | Turns on browser + web-server reporting. Unset = no-op.                                                                    |
| `SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT`               | api / web | Environment tag (falls back to `NODE_ENV`).                                                                                |
| `SENTRY_RELEASE`                                                      | api       | Release tag (auto-detected if unset).                                                                                      |
| `SENTRY_TRACES_SAMPLE_RATE` / `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | api / web | Performance-trace sample rate. **Default 0** ; enabling errors does not turn on trace volume.                              |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN`                 | web build | Enable **source-map upload** at build time. Set in CI only ; a build without the token still succeeds (upload is skipped). |

## Privacy

`sendDefaultPii` is **off** on every init. This app carries auth tokens and PII
in request headers, bodies, and cookies, so none of that is attached to events
by default. Session Replay is off (`replaysSessionSampleRate: 0`). Turn either
on per-deployment only with a scrubbing policy in place.

## Enabling it for a deployment

1. Create a Sentry project, copy its DSN.
2. Set `SENTRY_DSN` on the api service and `NEXT_PUBLIC_SENTRY_DSN` on the web
   service (they can point at the same or separate Sentry projects).
3. (Optional) For readable web stack traces, set `SENTRY_ORG`, `SENTRY_PROJECT`,
   and `SENTRY_AUTH_TOKEN` in the web build's CI environment.
4. (Optional) Raise `SENTRY_TRACES_SAMPLE_RATE` above 0 for performance tracing.
