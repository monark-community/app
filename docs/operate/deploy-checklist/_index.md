---
type: landing
---

# Deploy checklist

A first production deploy of one Monark instance: the api and its scheduled jobs on Render, the web app on Vercel, Postgres and sign-in on Supabase. One deployment serves one organization. Allow about an hour the first time; each phase below can be done in its own sitting, in this order.

- [Prepare accounts and secrets](prepare-accounts-and-secrets.md): generate the keys and create the Supabase project and mail provider everything else needs.
- [Deploy the api to Render](deploy-the-api-to-render.md): create the api and cron services from the blueprint and get the api URL.
- [Deploy the web app to Vercel](deploy-the-web-app-to-vercel.md): publish the web app, then point the api and Supabase at its URL.
- [Smoke-test a deployment](smoke-test-a-deployment.md): sign up, confirm, and make yourself the administrator.
- [Add custom domains](add-custom-domains.md): move both services to your own domain once the smoke test passes.

For a staging environment next to production, see [Add a staging environment](../add-a-staging-environment.md). Every variable is listed in [Environment variables](../../reference/environment-variables.md).
