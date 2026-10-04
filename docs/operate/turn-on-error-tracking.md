---
type: runbook
---

# Turn on error tracking

Send unhandled errors from the api, the web server and the browser to Sentry. With no DSN set, the Sentry SDK never starts and nothing is sent; setting the DSN is the only switch. About 15 minutes; both services redeploy.

What gets reported: unhandled errors in the api's raw routes (`/cron/*`, `/hooks/*`, `/chat/stream`), genuine server failures from tRPC procedures (not client errors such as unauthorized or not found), web server render and route errors, and browser errors. Browser events go through the app's own `/monitoring` route, so the Content-Security-Policy allows them and ad blockers don't drop them. Personal data is never attached (`sendDefaultPii` is off) and session replay is off; turn either on only with a scrubbing policy.

## Before you start

- [ ] A Sentry project (one for both services, or one each) and its DSN
- [ ] Access to the api's and web app's environment variables

## Steps

1. On the api, set:
   ```text
   SENTRY_DSN=<api-dsn>
   ```
   On Render, `SENTRY_ENVIRONMENT` is already `production` on `monark-api` and `staging` on `monark-api-staging`. Elsewhere it falls back to `NODE_ENV`.
2. On the web app, set:
   ```text
   NEXT_PUBLIC_SENTRY_DSN=<web-dsn>
   NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
   ```
   On Vercel, give the Preview environment `NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging`.
3. Optional, for readable browser stack traces: set `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` on the web app's build. A build without the token still succeeds; it only skips the source-map upload.
4. Optional, for performance tracing: raise `SENTRY_TRACES_SAMPLE_RATE` (api and web server) and `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` (browser) above `0`, for example `0.1`. Tracing is off by default so turning on errors doesn't add trace volume.
5. Redeploy both services.

## Verify

Open the web app, then run this in the browser console:

```js
setTimeout(() => {
  throw new Error("Sentry test");
});
```

The network panel shows a request to `/monitoring`, and the error appears in Sentry within a minute, tagged with the environment you set.

## If something goes wrong

| Symptom                                    | Cause                                           | Fix                                                          |
| ------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------ |
| No browser events                          | `NEXT_PUBLIC_SENTRY_DSN` set without a redeploy | Redeploy; `NEXT_PUBLIC_*` values are build-time.             |
| Browser stack traces are minified          | source-map upload skipped                       | Set the three build variables in step 3.                     |
| Staging errors show up as production       | environment tag not set on Preview              | Set `NEXT_PUBLIC_SENTRY_ENVIRONMENT` per Vercel environment. |
| Expected 404s or permission errors missing | client errors are deliberately not reported     | None; only server failures are sent.                         |

Next: [Turn on the AI assistant](turn-on-the-ai-assistant.md)
