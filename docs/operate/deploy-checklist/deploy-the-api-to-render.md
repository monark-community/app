---
type: runbook
---

# Deploy the api to Render

Create the production api and its two scheduled jobs from the repo's `render.yaml` blueprint. About 15 minutes; it creates Render services and applies every database migration to the production Supabase project.

## Before you start

- [ ] Everything from [Prepare accounts and secrets](prepare-accounts-and-secrets.md)
- [ ] A Render account with access to the GitHub repository

## Steps

1. In Render, choose **New → Blueprint** and pick the repository. Render reads `render.yaml`, which defines both environments: `monark-api`, `monark-cron-deletions`, `monark-cron-webhook-sweep` and the `monark-cron-shared` group on `main`, and the same names with `-staging` on `develop`.
2. Fill the `monark-cron-shared` group:

   | Key           | Value                                                              |
   | ------------- | ------------------------------------------------------------------ |
   | `CRON_SECRET` | your `CRON_SECRET`                                                 |
   | `API_URL`     | `https://monark-api.onrender.com` (a placeholder; fixed in step 6) |

3. Fill the `monark-api` prompts:

   | Key                                                               | Value                                                               |
   | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
   | `DATABASE_URL`, `DIRECT_URL`                                      | the pooler and direct URLs                                          |
   | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | from Supabase                                                       |
   | `WEB_ORIGIN`, `APP_URL`                                           | `https://monark.vercel.app` (placeholders; fixed in the next phase) |
   | `SMTP_URL`                                                        | your SMTP URL                                                       |
   | `SMTP_FROM`                                                       | `Monark <noreply@yourdomain.com>`                                   |
   | `TOTP_ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`                   | your generated keys                                                 |
   | `INITIAL_ORG_SLUG`, `INITIAL_ORG_NAME`                            | your organization's slug and display name                           |
   | `INITIAL_ORG_PRIMARY_COLOR`                                       | your brand colour, quoted: `"#2563EB"`                              |

   Leave `SENTRY_DSN`, `WEBHOOK_SECRETS_JSON` and the `BRANDING_*` keys blank for now; [Rebrand an instance](../rebrand-an-instance.md) and [Turn on error tracking](../turn-on-error-tracking.md) cover them. Leave the `-staging` services for [Add a staging environment](../add-a-staging-environment.md); they fail to start until then.

4. Click **Apply**. Render installs, runs `prisma generate`, then runs `pnpm --filter @monark/db exec prisma migrate deploy` before starting the api. A failed migration aborts the deploy and leaves nothing running.
5. Once `monark-api` is live, open it, go to **Environment**, and add `EMAIL_ACTION_SECRET` with your generated value. It isn't in the blueprint, and without it the api signs email links with a public development value. Save; Render redeploys.
6. Copy the service's public URL (for example `https://monark-api.onrender.com`) and set it as `API_URL` in the `monark-cron-shared` group.

## Verify

```sh
curl -s https://<api-host>/health
```

Expect `{"status":"ok","service":"api"}`. The api's log shows `webhook delivery worker started`, `Single-tenant bootstrap : created singleton organization` and `api listening`.

## If something goes wrong

| Symptom                                                 | Cause                                                          | Fix                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Deploy stops at the pre-deploy step                     | `prisma migrate deploy` couldn't reach or migrate the database | Check `DIRECT_URL` and its password, then **Manual Deploy**. |
| Log shows `Invalid environment:` and the process exits  | a required variable is missing or malformed                    | Fix the key named in the message.                            |
| Log shows `INITIAL_ORG_SLUG / INITIAL_ORG_NAME not set` | the org variables are empty                                    | Set them and redeploy.                                       |
| `INITIAL_ORG_PRIMARY_COLOR` ignored                     | the hex value wasn't quoted                                    | Re-enter it as `"#2563EB"`.                                  |
| Cron runs fail with `CRON_SECRET unset` or status `401` | the group value is missing or differs from the api's           | Make both read from `monark-cron-shared`.                    |

Next: [Deploy the web app to Vercel](deploy-the-web-app-to-vercel.md)
