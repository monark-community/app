---
type: tutorial
---

# Deploy your first instance

By the end you'll have a staging instance of Monark running from the `develop` branch: the api on Render, the web app on Vercel, Postgres and sign-in on Supabase, with you signed in as its administrator. It's for whoever will operate Monark, and takes about an hour. Production comes after, with the [deploy checklist](../operate/deploy-checklist/_index.md).

## Before you start

- Accounts on [Supabase](https://supabase.com), [Render](https://render.com) and [Vercel](https://vercel.com), each with access to your copy of the Monark repository on GitHub
- A local checkout of the repository with `pnpm install` done (see [Set up a development environment](set-up-a-development-environment.md))
- `openssl`, which Git Bash on Windows includes

## Generate the secrets

1. Run this four times and store each value, labelled, in your password manager:
   ```sh
   openssl rand -hex 32
   ```
   Label them `TOTP_ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `EMAIL_ACTION_SECRET` and `CRON_SECRET`. Each is 64 hex characters.

## Create the database

1. In Supabase, create a project named `monark-staging`.
2. From **Project Settings → API**, copy the project URL, the publishable key and the secret key.
3. From **Project Settings → Database**, copy the transaction pooler URL (port 6543) and the direct connection URL (port 5432), with your database password filled in.

You now have everything the api needs to reach its database.

## Deploy the api

1. In Render, choose **New → Blueprint** and pick the repository. Render lists the services in `render.yaml`: production ones on `main`, and `-staging` ones on `develop`.
2. Fill `monark-cron-shared-staging`: `CRON_SECRET` with your secret and `API_URL` with `https://monark-api-staging.onrender.com` for now.
3. Fill `monark-api-staging`: the two database URLs, the Supabase URL and both keys, the two encryption keys, `INITIAL_ORG_SLUG` (for example `acme`) and `INITIAL_ORG_NAME` (for example `Acme`). Set `WEB_ORIGIN` and `APP_URL` to `https://example.com` for now. Leave the rest blank; without `SMTP_URL` the api logs its emails instead of sending them, which is fine for staging.
4. Click **Apply**. Leave the production services empty; they fail to start until you set them up later.
5. When `monark-api-staging` is live, add `EMAIL_ACTION_SECRET` under its **Environment**, and copy its URL into `API_URL` in `monark-cron-shared-staging`.
6. Check it:
   ```sh
   curl -s https://<api-host>/health
   ```
   You see `{"status":"ok","service":"api"}`. The database now has every table, and your organization exists.

## Deploy the web app

1. In Vercel, choose **Add New → Project**, import the repository, and set **Root Directory** to `services/web`.
2. Add these variables, then click **Deploy**:

   | Key                                        | Value                         |
   | ------------------------------------------ | ----------------------------- |
   | `NEXT_PUBLIC_API_URL`                      | the staging api URL           |
   | `NEXT_PUBLIC_APP_URL`                      | `https://example.com` for now |
   | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` | the Supabase URL              |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`     | the publishable key           |
   | `SUPABASE_SECRET_KEY`                      | the secret key                |

3. In **Deployments**, create a deployment from the `develop` branch. Its stable URL is `https://<project>-git-develop-<team>.vercel.app`; this is your staging web host.
4. Set `NEXT_PUBLIC_APP_URL` to that host and redeploy the `develop` deployment.
5. In Render, set `WEB_ORIGIN` and `APP_URL` on `monark-api-staging` to the same host.
6. In Supabase, under **Authentication → URL Configuration**, set **Site URL** to the host and add `https://<web-host>/auth/confirm` and `https://<web-host>/auth/callback` as redirect URLs.

Open the web host: the sign-in page reads "Sign in to continue to Acme".

## Make yourself the administrator

1. Click **Create one**, enter your email and a password, and click **Create account**.
2. Open the confirmation email from Supabase and click its link. You're signed in.
3. From your local checkout, grant yourself the platform administrator role:
   ```sh
   DATABASE_URL="<direct-url>" DIRECT_URL="<direct-url>" pnpm tsx tools/sysadmin.ts grant <your-email>
   ```
   The command confirms the grant with your email and user id.
4. Open `https://<web-host>/admin`. The admin sections load.

## What you built

A staging instance with its own database, deployed from `develop`, and an administrator account on it. Every later push to `develop` redeploys it.

Next steps live in [Operate](../operate/_index.md): set up production with the [deploy checklist](../operate/deploy-checklist/_index.md), connect real email, [rebrand the instance](../operate/rebrand-an-instance.md), and [turn on error tracking](../operate/turn-on-error-tracking.md).
