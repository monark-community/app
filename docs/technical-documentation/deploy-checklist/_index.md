# Deploy checklist : Vercel (web) + Render (api)

Step-by-step walkthrough for a fresh production deploy. The app is single-tenant : one deployment serves one organization. To serve several businesses, run several instances ; see [multi-instance.md](../multi-instance/_index.md).

> This walkthrough sets up **production** (branch `main`). For the full two-environment model ; a **staging** environment that auto-deploys from `develop` alongside production : see [environments.md](../environments/_index.md) ; it reuses these same steps against a separate Supabase project + the `*-staging` Render services.

The dependency graph forces this order :

1. **Supabase production project** : Auth + Postgres. Both web and api read its keys.
2. **SMTP provider** : Resend / Postmark / SES. The api's outbound mail.
3. **Render** (api + crons) : needs production Postgres + SMTP + secrets ; produces the api URL.
4. **Vercel** (web) : needs the api URL.
5. **Loop back to Render** : update `WEB_ORIGIN` / `APP_URL` to the real Vercel URL.
6. **Smoke test** : sign up flow end-to-end.
7. **Custom domains** (optional) : once smoke passes.

Allow ~60 min the first time. Re-deploys after this take ~5 min each.

---

## In this section

- **[Phase 0 : Prerequisites](phase-0-prerequisites.md)**
- **[Phase 1 : Render : api + cron services](phase-1-render-api-cron-services/_index.md)**
- **[Phase 2 : Vercel : web](phase-2-vercel-web.md)**
- **[Phase 4 : Smoke test](phase-4-smoke-test.md)**
- **[Phase 5 : Custom domains (optional, do this once smoke passes)](phase-5-custom-domains-optional-do-this-once-smoke-passes.md)**

## Phase 3 : Loop back : update the api's web origin

### 3.1 Update Render env vars

Render dashboard → `monark-api` → Environment :

| Key          | New value                      |
| ------------ | ------------------------------ |
| `WEB_ORIGIN` | the Vercel URL from 2.4        |
| `APP_URL`    | the Vercel URL from 2.4 (same) |

Render auto-redeploys when env vars change. ~2 min.

### 3.2 Update Vercel env vars

Vercel dashboard → Project → Settings → Environment Variables :

| Key                   | New value           |
| --------------------- | ------------------- |
| `NEXT_PUBLIC_APP_URL` | the same Vercel URL |

Trigger a redeploy : Deployments → most recent → Redeploy. ~1 min (cached install).

### 3.3 Update Supabase Auth URL configuration

Supabase dashboard → Authentication → URL Configuration :

- **Site URL** : the Vercel URL (`https://monark.vercel.app`).
- **Redirect URLs** : add `https://monark.vercel.app/auth/confirm` and `https://monark.vercel.app/auth/callback` (whatever paths the auth flow uses).

Save. The change is live immediately ; no Supabase redeploy needed.

---

## What's NOT in this checklist

- **Backups.** Supabase auto-snapshots production projects daily ; verify the schedule in Supabase → Database → Backups. Render Postgres (if you ever swap off Supabase) needs explicit backup config.
- **Log retention.** Render's free tier retains ~7 days of logs ; Vercel keeps ~3 days. For longer retention, ship to Logtail / Datadog / etc.
- **Error tracking IS wired** : Sentry, opt-in per deployment via `SENTRY_DSN` (api) / `NEXT_PUBLIC_SENTRY_DSN` (web) ; see [observability.md](.././observability.md). **Uptime / latency monitoring is NOT** ; add UptimeRobot / Better Uptime / Pingdom against `https://api.yourdomain.com/health` and the web URL.
- **CDN / caching.** Vercel's edge handles the web ; the api has no caching layer yet (every request hits the api process). Add a CDN (Cloudflare, etc.) only if you start serving heavy public-asset endpoints.
