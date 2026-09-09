# Render (api + crons)

[`render.yaml`](../../../render.yaml) is one Blueprint that defines **both**
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
   and `monark-cron-shared-staging` with a _distinct_ staging `CRON_SECRET` +
   the staging api URL.
4. `SENTRY_ENVIRONMENT` is pre-set (`production` / `staging`) so Sentry separates
   the two automatically; set `SENTRY_DSN` on both (same or separate Sentry
   projects). See [observability.md](../observability.md).

Each api service runs its own `prisma migrate deploy` in `preDeployCommand`, so a
push to `develop` migrates the staging DB and a push to `main` migrates
production : independently. A migration that fails on staging aborts the staging
deploy and never reaches production.

Staging can run on a smaller Render plan than production ; drop `plan:` on the
`*-staging` services if you want to save cost (a free plan spins down when idle,
which is usually fine for staging).
