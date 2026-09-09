# Environments : staging + production

Three environments, mapped to branches:

| Environment    | Branch    | Web (Vercel)                          | API + crons (Render)                           | Database (Supabase)          |
| -------------- | --------- | ------------------------------------- | ---------------------------------------------- | ---------------------------- |
| **Local dev**  | any       | `pnpm dev`                            | `pnpm dev`                                     | local `supabase start`       |
| **Staging**    | `develop` | Preview deploy (stable branch domain) | `monark-api-staging` + `monark-cron-*-staging` | **separate** staging project |
| **Production** | `main`    | Production deploy                     | `monark-api` + `monark-cron-*`                 | production project           |

**A push to `develop` redeploys staging ; a push to `main` redeploys
production.** Both are native git deploys ; Render `autoDeploy` and Vercel's git
integration each watch their branch ; so there is no separate deploy workflow to
run. Deploys fire on push **in parallel with** CI (see [ci.md](../ci/_index.md)); staging
is where you catch what the gate can't.

The golden rule: **staging and production never share a database.** Staging
points at its own Supabase project so you can seed, migrate, and break it without
touching production data. Every `sync: false` env var in
[`render.yaml`](../../../render.yaml) holds a _separate_ value per environment.

> This guide covers the two environments of **one** instance. To run **many**
> isolated single-tenant instances ; one per business, each with its own
> database + domain via containers + Cloudflare ; see
> [multi-instance.md](../multi-instance/_index.md).

## In this section

- **[Render (api + crons)](render-api-crons.md)**
- **[Vercel (web)](vercel-web.md)**

## Promotion flow

```
feature branch → PR → merge to `develop` → auto-deploys STAGING
                                         → verify on staging
`develop` → PR → merge to `main`         → auto-deploys PRODUCTION
```

The first production deploy is the one-time [deploy-checklist.md](../deploy-checklist/_index.md)
walkthrough. This document is the **staging** half plus the branch→env wiring;
do the production setup first, then repeat the DB/Render/Vercel steps for staging.


## Supabase (database + auth)

Create a **second Supabase project** for staging. It needs the same setup as
production ([deploy-checklist.md](../deploy-checklist/_index.md) Phase 0.2):

- Copy its `URL` / publishable / secret keys into the staging Render api env and
  the Vercel **Preview** env vars.
- **Authentication → URL Configuration** → set the **Site URL** + redirect URLs
  to the _staging_ web URL (the `develop` Vercel domain), independently of
  production.
- Migrations reach it through the staging api's `preDeployCommand` on each
  `develop` deploy : you don't run them by hand.

(Supabase's own preview **branching** is an alternative for ephemeral per-PR
databases; a dedicated staging project is simpler for a single always-on staging
environment and is what `render.yaml` assumes.)


## Sentry

`SENTRY_ENVIRONMENT` is `production` on the prod services and `staging` on the
staging ones (set in `render.yaml`), and the web reads
`NEXT_PUBLIC_SENTRY_ENVIRONMENT` per Vercel environment. Point both at the same
Sentry project and use the environment filter, or use separate projects ; either
way errors are attributed to the right environment. See
[observability.md](../observability.md).


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
   staging URL (the [deploy-checklist.md](../deploy-checklist/_index.md) Phase 4 steps).


## Optional: gate deploys on CI

Native deploys fire on push regardless of CI. If you'd rather deploy **only after
the verify gate is green**, disable `autoDeploy` on the Render services + turn off
Vercel's automatic git deploys, and trigger each platform's deploy hook from a
GitHub Actions job keyed on `workflow_run` (the CI workflow) `conclusion == success`.
Not wired today : staging deploying on every push is the intended behaviour, so a
red build is visible on staging quickly.
