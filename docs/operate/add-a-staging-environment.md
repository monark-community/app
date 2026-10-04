---
type: runbook
---

# Add a staging environment

Run a staging copy of an instance that redeploys on every push to `develop`, next to production on `main`. About 45 minutes; it creates a second Supabase project and fills the `-staging` Render services.

| Environment | Branch    | Web (Vercel)          | api and jobs (Render)                         | Database (Supabase)    |
| ----------- | --------- | --------------------- | --------------------------------------------- | ---------------------- |
| Local       | any       | `pnpm dev`            | `pnpm dev`                                    | local `supabase start` |
| Staging     | `develop` | Preview deployment    | `monark-api-staging`, `monark-cron-*-staging` | its own project        |
| Production  | `main`    | Production deployment | `monark-api`, `monark-cron-*`                 | its own project        |

Staging and production never share a database or a secret. Each api migrates its own database in its pre-deploy step, so a migration that fails on staging never reaches production.

## Before you start

- [ ] Production deployed with the [deploy checklist](deploy-checklist/_index.md)
- [ ] Four freshly generated staging secrets ([Prepare accounts and secrets](deploy-checklist/prepare-accounts-and-secrets.md), step 1)

## Steps

1. Create a second Supabase project for staging and collect its URL, keys and both database URLs, as in [Prepare accounts and secrets](deploy-checklist/prepare-accounts-and-secrets.md).
2. In Render, fill `monark-cron-shared-staging` with the staging `CRON_SECRET` and a placeholder `API_URL`, then fill `monark-api-staging` from the staging project, as in [Deploy the api to Render](deploy-checklist/deploy-the-api-to-render.md). Add `EMAIL_ACTION_SECRET` under **Environment**. The staging api has no `BRANDING_*` keys in the blueprint; add any you want under **Environment**.
3. Once `monark-api-staging` is live, set its URL as `API_URL` in `monark-cron-shared-staging`.
4. In Vercel, open **Settings → Git** and set **Production Branch** to `main`. Every other branch, `develop` included, becomes a Preview deployment.
5. Give `develop` a stable host: under **Settings → Domains**, add a domain such as `staging.<yourdomain>` and assign it to the `develop` branch. Without one, use Vercel's branch alias `<project>-git-develop-<team>.vercel.app`.
6. Under **Settings → Environment Variables**, give each web variable a separate **Preview** value pointing at staging: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and any `NEXT_PUBLIC_SENTRY_*` or `NEXT_PUBLIC_BRANDING_*`.
7. Set `WEB_ORIGIN` and `APP_URL` on `monark-api-staging` to the staging web host.
8. In the staging Supabase project, under **Authentication → URL Configuration**, set **Site URL** to the staging web host and add its `/auth/confirm` and `/auth/callback` URLs.
9. Push a commit to `develop` and watch both Render and Vercel deploy it.

## Verify

Run the [smoke test](deploy-checklist/smoke-test-a-deployment.md) against the staging host, with the staging `DIRECT_URL`.

Good to know: every pull request also gets a Vercel preview, and previews share the Preview variables, so they talk to the staging api and database. Treat them as staging clients, not sandboxes.

## If something goes wrong

| Symptom                                       | Cause                                                                             | Fix                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Staging web calls the production api          | Preview variables not set, so Vercel used the Production values                   | Add Preview values for every variable in step 6, then redeploy. |
| Staging confirmation links open production    | staging Supabase **Site URL** still production's                                  | Fix step 8.                                                     |
| Pushing to `develop` doesn't redeploy the api | see [Deploy the api only after CI passes](deploy-the-api-only-after-ci-passes.md) | Follow its troubleshooting table.                               |

Next: [Deploy the api only after CI passes](deploy-the-api-only-after-ci-passes.md)
