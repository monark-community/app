---
type: landing
---

# Operate

Runbooks for whoever deploys and runs a Monark instance on Vercel, Render and Supabase. New to this? Start with [Deploy your first instance](../get-started/deploy-your-first-instance.md).

- [Deploy checklist](deploy-checklist/_index.md): a first production deploy, phase by phase.
- [Add a staging environment](add-a-staging-environment.md): a copy that redeploys from `develop`, with its own database.
- [Deploy the api only after CI passes](deploy-the-api-only-after-ci-passes.md): stop broken commits from reaching Render.
- [Set up social sign-in](set-up-social-sign-in.md): offer GitHub, Google or Microsoft sign-in.
- [Rebrand an instance](rebrand-an-instance.md): your product's name, colours, logo, favicon and auth emails.
- [Turn on error tracking](turn-on-error-tracking.md): send errors from every service to Sentry.
- [Turn on the AI assistant](turn-on-the-ai-assistant.md): connect the assistant to Anthropic and enable it.
- [Choose a webhook secret store](choose-a-webhook-secret-store.md): keep webhook deliveries signed across restarts.
- [Recover a locked-out user](recover-a-locked-out-user.md): when someone loses every sign-in factor, or the last administrator is locked out.
- [Run several instances](run-several-instances.md): one isolated instance per business, from one container image.
- [Run a second instance on your machine](run-a-second-instance-on-your-machine.md): two local stacks side by side.
- [Maintain the CI pipeline](ci.md): local checks, end-to-end runs, new jobs, coverage floors, docs sync.
