# Environments — staging + production

Three environments, mapped to branches:

| Environment | Branch | Web (Vercel) | API + crons (Render) | Database (Supabase) |
| --- | --- | --- | --- | --- |
| **Local dev** | any | `pnpm dev` | `pnpm dev` | local `supabase start` |
| **Staging** | `develop` | Preview deploy (stable branch domain) | `monark-api-staging` + `monark-cron-*-staging` | **separate** staging project |
| **Production** | `main` | Production deploy | `monark-api` + `monark-cron-*` | production project |

**A push to `develop` redeploys staging ; a push to `main` redeploys
production.** Both are native git deploys — Render `autoDeploy` and Vercel's git
integration each watch their branch — so there is no separate deploy workflow to
run. Deploys fire on push **in parallel with** CI (see [ci.md](ci.md)); staging
is where you catch what the gate can't.

The golden rule: **staging and production never share a database.** Staging
points at its own Supabase project so you can seed, migrate, and break it without
touching production data. Every `sync: false` env var in
[`render.yaml`](../../render.yaml) holds a *separate* value per environment.

## Promotion flow

```
feature branch → PR → merge to `develop` → auto-deploys STAGING
                                         → verify on staging
`develop` → PR → merge to `main`         → auto-deploys PRODUCTION
```

The first production deploy is the one-time [deploy-checklist.md](deploy-checklist.md)
walkthrough. This document is the **staging** half plus the branch→env wiring;
do the production setup first, then repeat the DB/Render/Vercel steps for staging.

## Render (api + crons)

[`render.yaml`](../../render.yaml) is one Blueprint that defines **both**
environments: the production services on `branch: main` and mirror
`*-staging` services on `branch: develop`. The build / migrate / start / cron
commands are identical (shared via YAML anchors); only the branch, the service
names, and the `sync: false` values differ.

Setup:

1. Create the Blueprint once (**New → Blueprint → this repo**). Render provisions
   all six services + both env-var groups and prompts for every `sync: false`
   value.
2. Fill the **production** api's env from the real production Supabase project
   (as in the deploy checklist), and `monark-cron-shared` with the production
   `CRON_SECRET` + `API_URL`.
3. Fill the **`monark-api-staging`** env from the **staging** Supabase project,
   and `monark-cron-shared-staging` with a *distinct* staging `CRON_SECRET` +
   the staging api URL.
4. `SENTRY_ENVIRONMENT` is pre-set (`production` / `staging`) so Sentry separates
   the two automatically; set `SENTRY_DSN` on both (same or separate Sentry
   projects). See [observability.md](observability.md).

Each api service runs its own `prisma migrate deploy` in `preDeployCommand`, so a
push to `develop` migrates the staging DB and a push to `main` migrates
production — independently. A migration that fails on staging aborts the staging
deploy and never reaches production.

Staging can run on a smaller Render plan than production — drop `plan:` on the
`*-staging` services if you want to save cost (a free plan spins down when idle,
which is usually fine for staging).

## Vercel (web)

Vercel maps branches to environments through the dashboard, not `vercel.json`:

1. **Project → Settings → Git → Production Branch = `main`.** Every push to
   `main` is a Production deploy; every other branch (including `develop`) is a
   **Preview** deploy automatically.
2. **Give `develop` a stable staging URL.** Vercel already assigns a durable
   per-branch alias (`<project>-git-develop-<team>.vercel.app`). For a nicer host,
   add a domain (e.g. `staging.yourdomain.com`) under **Settings → Domains** and
   assign it to the `develop` branch.
3. **Scope env vars by environment.** Under **Settings → Environment Variables**,
   set each `NEXT_PUBLIC_*` for **Production** (→ prod api / prod Supabase) and a
   separate value for **Preview** (→ staging api / staging Supabase):
   `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, plus the optional
   `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_BRANDING_*`. Preview values point the
   staging web at the staging api + staging Supabase.

The [`vercel.json`](../../services/web/vercel.json) `ignoreCommand` skips a build
when a push touched nothing under `services/web` or the shared packages — that
applies to both environments.

> **Note on PR previews.** Because every non-production branch is a Vercel
> Preview, each **PR also gets its own ephemeral preview URL** — but those share
> the *Preview* env vars, so they talk to the **staging** api + Supabase. Treat
> PR previews as staging-data clients, not isolated sandboxes.

## Supabase (database + auth)

Create a **second Supabase project** for staging. It needs the same setup as
production ([deploy-checklist.md](deploy-checklist.md) Phase 0.2):

- Copy its `URL` / publishable / secret keys into the staging Render api env and
  the Vercel **Preview** env vars.
- **Authentication → URL Configuration** → set the **Site URL** + redirect URLs
  to the *staging* web URL (the `develop` Vercel domain), independently of
  production.
- Migrations reach it through the staging api's `preDeployCommand` on each
  `develop` deploy — you don't run them by hand.

(Supabase's own preview **branching** is an alternative for ephemeral per-PR
databases; a dedicated staging project is simpler for a single always-on staging
environment and is what `render.yaml` assumes.)

## Sentry

`SENTRY_ENVIRONMENT` is `production` on the prod services and `staging` on the
staging ones (set in `render.yaml`), and the web reads
`NEXT_PUBLIC_SENTRY_ENVIRONMENT` per Vercel environment. Point both at the same
Sentry project and use the environment filter, or use separate projects — either
way errors are attributed to the right environment. See
[observability.md](observability.md).

## First-time staging checklist

1. Create the staging **Supabase** project; copy its URL + keys.
2. Sync the Render **Blueprint** (if not already) → fill `monark-api-staging` +
   `monark-cron-shared-staging` from the staging Supabase + a fresh staging
   `CRON_SECRET`. Copy the staging api URL back into
   `monark-cron-shared-staging.API_URL`.
3. In **Vercel**, set Production Branch = `main`, add the staging domain to
   `develop`, and fill the **Preview** env vars (staging api + staging Supabase).
4. Set the staging Supabase **Auth URL config** to the staging web URL.
5. Push to `develop` → watch staging build in Render + Vercel → smoke-test the
   staging URL (the [deploy-checklist.md](deploy-checklist.md) Phase 4 steps).

## Optional: gate deploys on CI

Native deploys fire on push regardless of CI. If you'd rather deploy **only after
the verify gate is green**, disable `autoDeploy` on the Render services + turn off
Vercel's automatic git deploys, and trigger each platform's deploy hook from a
GitHub Actions job keyed on `workflow_run` (the CI workflow) `conclusion == success`.
Not wired today — staging deploying on every push is the intended behaviour, so a
red build is visible on staging quickly.
