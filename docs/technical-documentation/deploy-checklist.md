# Deploy checklist — Vercel (web) + Render (api)

Step-by-step walkthrough for a fresh production deploy. Assumes a single-tenant launch ; multi-tenant has additional setup not covered here.

> This walkthrough sets up **production** (branch `main`). For the full two-environment model — a **staging** environment that auto-deploys from `develop` alongside production — see [environments.md](environments.md) ; it reuses these same steps against a separate Supabase project + the `*-staging` Render services.

The dependency graph forces this order :

1. **Supabase production project** — Auth + Postgres. Both web and api read its keys.
2. **SMTP provider** — Resend / Postmark / SES. The api's outbound mail.
3. **Render** (api + crons) — needs production Postgres + SMTP + secrets ; produces the api URL.
4. **Vercel** (web) — needs the api URL.
5. **Loop back to Render** — update `WEB_ORIGIN` / `APP_URL` to the real Vercel URL.
6. **Smoke test** — sign up flow end-to-end.
7. **Custom domains** (optional) — once smoke passes.

Allow ~60 min the first time. Re-deploys after this take ~5 min each.

---

## Phase 0 — Prerequisites

### 0.1 Generate the deploy-time secrets

Three values you'll paste into Render. Generate them once, store in your password manager :

```sh
# Linux / macOS / Git Bash on Windows
openssl rand -hex 32   # → TOTP_ENCRYPTION_KEY (32 bytes hex = 64 chars)
openssl rand -hex 32   # → SECRETS_ENCRYPTION_KEY (org-secrets store ; separate key from TOTP)
openssl rand -hex 32   # → CRON_SECRET
```

These are operator secrets — never commit, never share over chat. Rotating `TOTP_ENCRYPTION_KEY` invalidates every existing TOTP enrollment ; rotating `SECRETS_ENCRYPTION_KEY` invalidates every stored org secret (webhook + integration credentials must be re-entered) ; rotating `CRON_SECRET` is harmless mid-month.

### 0.2 Create a production Supabase project

[supabase.com](https://supabase.com) → New project. Pick a region close to where you'll deploy Vercel + Render (us-west, us-east, eu-central are common pairings).

After it provisions :

- **Project Settings → API** : copy `URL`, `publishable` key (formerly "anon"), `secret` key (formerly "service_role").
- **Project Settings → Database** : copy the `Transaction pooler` URL (port 6543) for `DATABASE_URL` and the `Direct connection` URL (port 5432) for `DIRECT_URL`. Replace `[YOUR-PASSWORD]` with the real password from the dashboard.
- **Authentication → URL Configuration** : leave the Site URL empty for now ; we'll fill it in Phase 5 once the Vercel URL exists.
- **Authentication → Providers → Email** : enable. Disable any other providers you don't intend to support yet.

### 0.3 Set up SMTP

Pick a provider. Resend is the simplest :

1. [resend.com](https://resend.com) → API Keys → create.
2. Add a verified sender domain (DNS DKIM + SPF records).
3. The SMTP URL format is `smtps://resend:<API_KEY>@smtp.resend.com:465`.

Postmark / SES / Brevo / Mailgun all work the same way — `smtps://username:password@host:port` (or `smtp://...` on port 587 if you prefer STARTTLS).

---

## Phase 1 — Render : api + cron services

### 1.1 Connect the GitHub repo to Render

[render.com](https://render.com) → New → Blueprint. Pick this repo.

Render reads [`render.yaml`](../../render.yaml) at the repo root, which defines **both** environments — production services on `branch: main` and mirror `*-staging` services on `branch: develop`. It lists six services + two env-var groups :

- **Production** (`main`) : `monark-api`, `monark-cron-deletions`, `monark-cron-webhook-sweep`, and the `monark-cron-shared` group.
- **Staging** (`develop`) : `monark-api-staging`, `monark-cron-deletions-staging`, `monark-cron-webhook-sweep-staging`, and the `monark-cron-shared-staging` group.

For this production walkthrough, fill only the **production** services + `monark-cron-shared` below ; leave the `*-staging` ones for when you stand up staging (see [environments.md](environments.md)). Don't click "Apply" yet — open the env-var prompts first.

### 1.2 Fill the `monark-cron-shared` env-var group

| Key           | Value                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------- |
| `CRON_SECRET` | the secret from 0.1                                                                         |
| `API_URL`     | `https://monark-api.onrender.com` ← placeholder for now ; we'll update once the api is live |

The api service inherits both via `fromGroup: monark-cron-shared` — no need to duplicate.

### 1.3 Fill `monark-api` env vars

Most are operator-set (`sync: false` in [render.yaml](../../render.yaml)). Render prompts for them on first deploy.

| Key                         | Value                                                                      |
| --------------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`              | Supabase pooler URL (port 6543)                                            |
| `DIRECT_URL`                | Supabase direct connection URL (port 5432)                                 |
| `SUPABASE_URL`              | from 0.2                                                                   |
| `SUPABASE_PUBLISHABLE_KEY`  | from 0.2                                                                   |
| `SUPABASE_SECRET_KEY`       | from 0.2                                                                   |
| `WEB_ORIGIN`                | `https://monark.vercel.app` ← placeholder, updated in Phase 3              |
| `APP_URL`                   | `https://monark.vercel.app` ← same                                         |
| `SMTP_URL`                  | from 0.3                                                                   |
| `SMTP_FROM`                 | `Monark <noreply@yourdomain.com>`                                          |
| `TOTP_ENCRYPTION_KEY`       | from 0.1                                                                   |
| `SECRETS_ENCRYPTION_KEY`    | from 0.1 (org-secrets store — required once any secret-using module is on) |
| `INITIAL_ORG_SLUG`          | `monark` (or whatever slug your singleton org should have)                 |
| `INITIAL_ORG_NAME`          | `Monark` (or your display name)                                            |
| `INITIAL_ORG_PRIMARY_COLOR` | `"#2563EB"` — your brand color, **quoted**. Themes the whole running UI    |
| `WEBHOOK_SECRETS_JSON`      | leave blank for now — fill once you create webhook endpoints               |

> **Quote any value that starts with `#`.** Node's `--env-file` parser reads an
> unquoted leading `#` as a comment, so `INITIAL_ORG_PRIMARY_COLOR=#2563EB`
> resolves to an empty string. Same for `BRANDING_PRIMARY` / `BRANDING_ACCENT`.

Optional, depending on your setup :

- **Error tracking** — set `SENTRY_DSN` to turn on server-side Sentry (a complete no-op if unset). See [observability.md](./observability.md).
- **White-label branding** — set the `BRANDING_*` vars (`BRANDING_APP_NAME`, `BRANDING_TAGLINE`, `BRANDING_SUPPORT_EMAIL`, `BRANDING_PRIMARY`, `BRANDING_FROM_EMAIL`, `BRANDING_TOTP_ISSUER`, …) to your product's identity ; each is optional and falls back to the neutral starter default. See [white-label.md](./white-label.md). Three surfaces are **not** covered by env and need a file edit before launch : the favicon, the three Supabase auth email templates, and the org logo (uploaded in-app). white-label.md's retargeting checklist walks all of them.

### 1.4 Click "Apply"

Render runs the build (`pnpm install` + `prisma generate`), the `preDeployCommand` (`prisma migrate deploy` against Supabase Postgres), then starts the api. Watch the logs in the dashboard.

Expected milestones in the api log :

- `webhook delivery worker started`
- `Single-tenant bootstrap : evaluating boot-time hook`
- `api listening on port 4000` (or similar)

The `/health` endpoint should respond 200 ; Render's health check runs every 60 s.

If `prisma migrate deploy` fails, the deploy aborts cleanly — fix the schema / DB credentials and push again.

The singleton org is provisioned at api boot from `INITIAL_ORG_*` (idempotent — a restart on a healthy install is a no-op). To (re)provision without a restart — e.g. from a Render Shell with `DATABASE_URL` set — run `pnpm provision:org` (reads the same `INITIAL_ORG_*` env, or takes `--slug` / `--name` / `--color` flags).

### 1.5 Copy the api URL

Once the deploy goes green, the dashboard shows the public URL. Format : `https://monark-api.onrender.com` (or whatever Render auto-assigns).

Update `monark-cron-shared.API_URL` to this value. The two cron services pick it up on their next scheduled run.

---

## Phase 2 — Vercel : web

### 2.1 Import the repo

[vercel.com](https://vercel.com) → New Project → import this repo.

In the import dialog :

- **Root Directory** : `services/web`
- **Framework Preset** : Next.js (auto-detected)
- Build / install commands : leave on auto-detect ; Vercel reads them from [services/web/vercel.json](../../services/web/vercel.json).

### 2.2 Set environment variables

Add these in the import dialog before clicking Deploy :

| Key                                    | Value                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | from 0.2                                                                       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | from 0.2 (the publishable / anon key, NOT secret)                              |
| `NEXT_PUBLIC_API_URL`                  | the api URL from 1.5                                                           |
| `NEXT_PUBLIC_APP_URL`                  | placeholder for now ; we'll update in Phase 3 once we know the real Vercel URL |

Don't add `SUPABASE_SECRET_KEY` here — the web service must NEVER read the service-role key.

Optional :

- **Error tracking** — `NEXT_PUBLIC_SENTRY_DSN` turns on browser + web-server Sentry. For readable production stack traces, also set `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` (source-map upload at build time ; a build without the token still succeeds). See [observability.md](./observability.md).
- **White-label branding** — mirror the api's `BRANDING_*` vars with the `NEXT_PUBLIC_BRANDING_*` duplicates (`NEXT_PUBLIC_BRANDING_APP_NAME`, `NEXT_PUBLIC_BRANDING_PRIMARY`, …) so the browser bundle picks them up. See [white-label.md](./white-label.md).

### 2.3 Pin the region

Settings → Functions → Region → pick one matching the api's Render region. Cross-region tRPC calls cost 50–200 ms per round-trip ; co-locating cuts latency.

| api on Render | Vercel region    |
| ------------- | ---------------- |
| `oregon`      | `sfo1` or `pdx1` |
| `ohio`        | `iad1` or `cle1` |
| `frankfurt`   | `cdg1` or `fra1` |

### 2.4 Click Deploy

Vercel runs the build from the workspace root (`pnpm install --frozen-lockfile && pnpm gen && pnpm --filter web build`). Watch the build log.

Expected milestones :

- "Installing dependencies..." (~30 s with cache)
- "Generating events / routers..." (codegen)
- "Building Next.js..." (~1 min)
- "Compiled successfully" + the deploy URL

Once green, copy the Vercel URL — `https://monark-<hash>.vercel.app` initially, or your project's primary URL.

---

## Phase 3 — Loop back : update the api's web origin

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

## Phase 4 — Smoke test

Hit the deployed app from a browser :

1. Open `https://monark.vercel.app`. The (anon) layout sees no session and lands you on `/signin`.
2. Click "Create account". Fill an email + password. Submit.
3. Wait 5–10 s for the verification email. Check the inbox of the email you signed up with — Resend / Postmark dashboards also show outbound mail logs.
4. Click the verification link. Lands on `/account` with a confirmed account.
5. The first user to sign up + confirm gets `bootstrap` admin (per the api's `maybeBootstrapSingletonOrg` hook). Visit `/admin` to confirm.
6. Open `https://monark-api.onrender.com/health` directly — should return `{ "ok": true, "service": "api" }`.
7. (Optional) Test a webhook : `/admin/webhooks` → New endpoint pointing at `https://webhook.site/<your-uuid>` → trigger an event (toggle a feature flag in `/admin/feature-flags`) → check webhook.site for the delivery + the `Webhook-Signature` header.

If any step fails :

- **Sign-in bounces back to `/signin`** : check api logs for trusted-device errors. The `MONARK_AUTH_GATE_DEBUG=1` env var on the api makes the (authed) layout log which gate path fired.
- **Verification email never arrives** : check the SMTP provider's dashboard. Common gotcha : sender domain not verified yet.
- **`/admin` 404** : the singleton-org bootstrap didn't run. Check api logs for `Single-tenant bootstrap` lines.
- **Webhook delivery fails with "no plaintext secret available"** : you need to populate `WEBHOOK_SECRETS_JSON` on the api with the secret returned at endpoint creation. See [webhook-secret-resolver.md](./webhook-secret-resolver.md).

---

## Phase 5 — Custom domains (optional, do this once smoke passes)

### 5.1 Vercel : `app.yourdomain.com`

Vercel project → Settings → Domains → Add. Vercel gives you DNS records to add at your registrar (CNAME pointing at `cname.vercel-dns.com`).

After DNS propagates (~5–60 min), Vercel auto-provisions a TLS cert.

### 5.2 Render : `api.yourdomain.com`

Render `monark-api` → Settings → Custom Domains → Add. Render gives you a CNAME target (`<service>.onrender.com`).

After DNS propagates, Render provisions a TLS cert too.

### 5.3 Update env vars to the custom domains

Render `monark-api` → Environment :

| Key          | New value                    |
| ------------ | ---------------------------- |
| `WEB_ORIGIN` | `https://app.yourdomain.com` |
| `APP_URL`    | `https://app.yourdomain.com` |

Update `monark-cron-shared.API_URL` to `https://api.yourdomain.com`.

Vercel project → Environment Variables :

| Key                   | New value                    |
| --------------------- | ---------------------------- |
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com` |
| `NEXT_PUBLIC_APP_URL` | `https://app.yourdomain.com` |

Both platforms auto-redeploy on env-var changes. Wait ~3 min.

### 5.4 Update Supabase Auth URL configuration

Supabase → Authentication → URL Configuration :

- **Site URL** → `https://app.yourdomain.com`
- **Redirect URLs** → add the new auth paths under the custom domain ; you can leave the old `*.vercel.app` paths in for a grace period.

### 5.5 Re-smoke

Run Phase 4 again against the custom domain to confirm everything still works end-to-end.

---

## What's NOT in this checklist

- **Multi-tenant mode.** The `tenancy.multi-tenant` feature flag is OFF by default. Flip it on only after the org-selector UI is wired (currently incomplete — see backlog).
- **Backups.** Supabase auto-snapshots production projects daily ; verify the schedule in Supabase → Database → Backups. Render Postgres (if you ever swap off Supabase) needs explicit backup config.
- **Log retention.** Render's free tier retains ~7 days of logs ; Vercel keeps ~3 days. For longer retention, ship to Logtail / Datadog / etc.
- **Error tracking IS wired** — Sentry, opt-in per deployment via `SENTRY_DSN` (api) / `NEXT_PUBLIC_SENTRY_DSN` (web) ; see [observability.md](./observability.md). **Uptime / latency monitoring is NOT** — add UptimeRobot / Better Uptime / Pingdom against `https://api.yourdomain.com/health` and the web URL.
- **CDN / caching.** Vercel's edge handles the web ; the api has no caching layer yet (every request hits the api process). Add a CDN (Cloudflare, etc.) only if you start serving heavy public-asset endpoints.
