---
type: reference
---

# Environment variables

Every environment variable a Monark deployment reads, grouped by the service that reads it. "Required" means the service refuses to start, or the named feature fails, without it.

<!-- source: services/api/src/lib/env.ts, services/api/.env.example, services/web/.env.example, render.yaml, packages/*/src -->

Quote any value that starts with `#`, such as a hex colour: `BRANDING_PRIMARY="#2563EB"`. Node's `--env-file` parser and the Render dashboard read an unquoted `#` as the start of a comment, so the value becomes empty.

## API service (`services/api`)

Set in `services/api/.env` locally and on the `monark-api` / `monark-api-staging` Render services. Variables marked "not in render.yaml" must be added by hand under the service's **Environment**.

### Runtime and network

| Variable       | Required | Default                                       | What it does                                                                                                                  |
| -------------- | -------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`     | no       | `development`                                 | `development`, `test` or `production`. Production tightens CORS to `WEB_ORIGIN` only. Render sets `production`.               |
| `PORT`         | no       | `4000`                                        | Port the api listens on (bound to `0.0.0.0`).                                                                                 |
| `WEB_ORIGIN`   | yes      | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated CORS and cookie allowlist: the web app's origin. In development, any private-network origin is also accepted. |
| `APP_URL`      | yes      | `http://localhost:3000`                       | Web app origin used to build links in emails when no request host is available (crons, scripts).                              |
| `LOG_LEVEL`    | no       | `info`                                        | Log level for the structured logger.                                                                                          |
| `SERVICE_NAME` | no       | `monark`                                      | Value of the `service` field on every log line. Not in render.yaml.                                                           |

### Database and Supabase

| Variable                   | Required | Default | What it does                                                                              |
| -------------------------- | -------- | ------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | yes      | none    | Postgres connection used at runtime. On Supabase, the transaction pooler URL (port 6543). |
| `DIRECT_URL`               | yes      | none    | Direct Postgres connection (port 5432), used by `prisma migrate deploy`.                  |
| `SUPABASE_URL`             | yes      | none    | Supabase project URL. The api exits at boot if it's missing.                              |
| `SUPABASE_PUBLISHABLE_KEY` | yes      | none    | Supabase publishable (formerly anon) key; signup creates the auth user through it.        |
| `SUPABASE_SECRET_KEY`      | yes      | none    | Supabase secret (formerly service_role) key for admin operations and file storage.        |

### Secrets and keys

| Variable                 | Required                    | Default           | What it does                                                                                                                                               |
| ------------------------ | --------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TOTP_ENCRYPTION_KEY`    | for two-factor              | none              | 32 bytes as 64 hex characters. Encrypts two-factor secrets at rest. Changing it invalidates every enrollment.                                              |
| `SECRETS_ENCRYPTION_KEY` | once any org secret is used | none              | 32 bytes as 64 hex characters. Encrypts the org secrets store. Changing it makes every stored secret unreadable.                                           |
| `EMAIL_ACTION_SECRET`    | in production               | a fixed dev value | At least 32 characters. Signs one-click email links ("revoke this device"). Unset falls back to a public dev value and logs a warning. Not in render.yaml. |
| `CRON_SECRET`            | for scheduled jobs          | none              | Bearer token every `/cron/*` endpoint requires. Unset makes them answer `503`. On Render it comes from the `monark-cron-shared` group.                     |

### Organization bootstrap

| Variable                    | Required            | Default | What it does                                                                                                      |
| --------------------------- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `INITIAL_ORG_SLUG`          | on a fresh database | none    | Slug of the organization the api creates at boot when none exists. 2 to 60 lowercase letters, digits and hyphens. |
| `INITIAL_ORG_NAME`          | on a fresh database | none    | Display name of that organization, up to 120 characters.                                                          |
| `INITIAL_ORG_PRIMARY_COLOR` | no                  | none    | Hex colour (`#RGB` or `#RRGGBB`, quoted) that themes the whole UI. Falls back to `BRANDING_PRIMARY`.              |

### Sign-in and webhooks

| Variable                          | Required | Default                                    | What it does                                                                                                               |
| --------------------------------- | -------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_OAUTH_PROVIDERS`            | no       | empty                                      | Comma-separated social sign-in providers to offer: `github`, `google`, `azure`. Not in render.yaml or `.env.example`.      |
| `WEBHOOK_SECRETS_JSON`            | no       | empty                                      | JSON object mapping webhook endpoint ids to their signing secrets.                                                         |
| `WEBHOOK_SECRET_<endpointId>`     | no       | none                                       | One endpoint's signing secret, read when `WEBHOOK_SECRETS_JSON` has no entry for it. Not in render.yaml.                   |
| `MONARK_DEV_WEBHOOK_SECRETS_FILE` | no       | `.cache/monark-webhook-secrets.json` (dev) | File that stores webhook signing secrets. Used by default outside production; in production only when set, with a warning. |

### Branding

All optional; an unset variable falls back to the neutral default shown. The web app needs the `NEXT_PUBLIC_` mirror of each one it displays.

| Variable                 | Default                     | What it does                                                                                |
| ------------------------ | --------------------------- | ------------------------------------------------------------------------------------------- |
| `BRANDING_APP_NAME`      | `App`                       | Product name in the UI, page titles, emails.                                                |
| `BRANDING_TAGLINE`       | `A starter application.`    | Tagline on the sign-in screen and in the page description.                                  |
| `BRANDING_SUPPORT_EMAIL` | `support@example.com`       | Support address shown to users.                                                             |
| `BRANDING_TOTP_ISSUER`   | `App`                       | Name shown in authenticator apps. Changing it later forces re-enrollment.                   |
| `BRANDING_FROM_EMAIL`    | `App <noreply@example.com>` | Sender for outbound mail when `SMTP_FROM` is unset.                                         |
| `BRANDING_PRIMARY`       | `#2563EB`                   | Brand colour when the organization has none.                                                |
| `BRANDING_ACCENT`        | `#4F46E5`                   | Second stop of gradient surfaces.                                                           |
| `BRANDING_LOGO_SRC`      | `/logo.svg`                 | Logo path under `services/web/public/`, used before an org logo exists. Not in render.yaml. |

### Email

| Variable    | Required      | Default               | What it does                                                                               |
| ----------- | ------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| `SMTP_URL`  | in production | none                  | `smtps://user:password@host:465` or `smtp://…:587`. Unset logs mail instead of sending it. |
| `SMTP_FROM` | no            | `BRANDING_FROM_EMAIL` | Sender address, for example `Monark <noreply@yourdomain.com>`.                             |

### Error tracking

| Variable                    | Required | Default      | What it does                                                |
| --------------------------- | -------- | ------------ | ----------------------------------------------------------- |
| `SENTRY_DSN`                | no       | none         | Turns on server error reporting. Unset is a no-op.          |
| `SENTRY_ENVIRONMENT`        | no       | `NODE_ENV`   | Environment tag. render.yaml sets `production` / `staging`. |
| `SENTRY_RELEASE`            | no       | Sentry's own | Release tag.                                                |
| `SENTRY_TRACES_SAMPLE_RATE` | no       | `0`          | Share of requests traced for performance.                   |

### AI assistant

None of these are in render.yaml or `.env.example`. Restart the api after changing them.

| Variable              | Required             | Default                      | What it does                                                                   |
| --------------------- | -------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`   | for the AI assistant | none                         | Read on first use, not at boot. Unset makes assistant replies fail with `503`. |
| `CHAT_LLM_PROVIDER`   | no                   | `anthropic`                  | Model provider. Any other value fails with `503`.                              |
| `CHAT_LLM_MODEL`      | no                   | `claude-sonnet-4-5-20250929` | Model id.                                                                      |
| `CHAT_LLM_MAX_TOKENS` | no                   | `4096`                       | Maximum tokens per reply.                                                      |
| `CHAT_ASSISTANT_NAME` | no                   | `Chrysa`                     | Assistant's name across the deployment.                                        |

### Public API

| Variable                     | Required | Default | What it does                                                 |
| ---------------------------- | -------- | ------- | ------------------------------------------------------------ |
| `PUBLIC_API_RATE_PER_SECOND` | no       | `5`     | Per-key token refill rate for `/api/v1`. Not in render.yaml. |
| `PUBLIC_API_BURST`           | no       | `20`    | Per-key burst ceiling for `/api/v1`. Not in render.yaml.     |

## Web app (`services/web`)

Set in `services/web/.env` locally and in the Vercel project. `NEXT_PUBLIC_*` values are compiled into the build, so changing one takes a redeploy.

| Variable                                                                                          | Required | Default                   | What it does                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`                                                                             | yes      | none                      | Browser-facing api origin. Also added to the Content-Security-Policy `connect-src`.                                                   |
| `NEXT_PUBLIC_APP_URL`                                                                             | yes      | none                      | The web app's own origin.                                                                                                             |
| `NEXT_PUBLIC_SUPABASE_URL`                                                                        | yes      | none                      | Supabase project URL for the browser.                                                                                                 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                                                            | yes      | none                      | Supabase publishable key for the browser.                                                                                             |
| `SUPABASE_URL`                                                                                    | yes      | none                      | Supabase project URL for server actions.                                                                                              |
| `SUPABASE_SECRET_KEY`                                                                             | yes      | none                      | Server-only. Used by admin server actions such as uploading the organization logo. Never set it as `NEXT_PUBLIC_SUPABASE_SECRET_KEY`. |
| `NEXT_PUBLIC_BRANDING_APP_NAME`, `_TAGLINE`, `_SUPPORT_EMAIL`, `_PRIMARY`, `_ACCENT`, `_LOGO_SRC` | no       | as the api's `BRANDING_*` | Browser mirrors of the branding variables. Keep them equal to the api's values.                                                       |
| `NEXT_PUBLIC_SENTRY_DSN`                                                                          | no       | none                      | Turns on browser and web-server error reporting.                                                                                      |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT`                                                                  | no       | `NODE_ENV`                | Environment tag.                                                                                                                      |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`                                                           | no       | `0`                       | Browser trace sample rate.                                                                                                            |
| `SENTRY_TRACES_SAMPLE_RATE`                                                                       | no       | `0`                       | Web-server trace sample rate.                                                                                                         |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`                                               | no       | none                      | Build-time source-map upload. A build without the token still succeeds.                                                               |
| `NEXT_PUBLIC_AUTH_STORAGE_KEY`                                                                    | no       | `sb-app-auth-token`       | Name of the browser storage key holding the session.                                                                                  |
| `MONARK_AUTH_GATE_DEBUG`                                                                          | no       | unset                     | `1` logs which sign-in gate redirected a request.                                                                                     |
| `PORT`                                                                                            | no       | `3000`                    | Local `pnpm dev` port. Read from the shell, then `services/web/.env.local`, then `services/web/.env`.                                 |

## Scheduled jobs (Render cron services)

Shared through the `monark-cron-shared` group (production) and `monark-cron-shared-staging` (staging).

| Variable      | Required | What it does                                                         |
| ------------- | -------- | -------------------------------------------------------------------- |
| `CRON_SECRET` | yes      | Same value as the api's `CRON_SECRET`.                               |
| `API_URL`     | yes      | The api's public URL, for example `https://monark-api.onrender.com`. |

## Prisma CLI (`packages/db/.env`)

| Variable       | Required | What it does                                                     |
| -------------- | -------- | ---------------------------------------------------------------- |
| `DATABASE_URL` | yes      | Same as the api's. Read by `prisma migrate` and `prisma studio`. |
| `DIRECT_URL`   | yes      | Same as the api's.                                               |

## Supabase CLI (root `.env`, local only)

The Supabase CLI resolves `env(...)` references in `supabase/config.toml` from its own environment or a `.env` in the folder you run it from. It doesn't read `services/api/.env`.

| Variable                                                    | What it does                        |
| ----------------------------------------------------------- | ----------------------------------- |
| `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID`, `_GITHUB_SECRET` | GitHub OAuth app credentials.       |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `_GOOGLE_SECRET` | Google OAuth client credentials.    |
| `SUPABASE_AUTH_EXTERNAL_AZURE_CLIENT_ID`, `_AZURE_SECRET`   | Microsoft Entra ID app credentials. |

## CI and repo tools

| Variable                                                                       | Read by                              | What it does                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------- |
| `SHADOW_DATABASE_URL`                                                          | `pnpm check:migrations`              | Throwaway Postgres the migrations are replayed into.            |
| `RENDER_API_KEY`                                                               | `deploy-api.yml` (Actions secret)    | Lets CI trigger Render deploys after a green run.               |
| `DOCS_SYNC_APP_CLIENT_ID`, `DOCS_SYNC_APP_PRIVATE_KEY`                         | `notify-docs.yml` (Actions secrets)  | GitHub App that tells the docs site to sync.                    |
| `CODECOV_TOKEN`                                                                | `ci.yml` (Actions secret)            | Coverage upload to Codecov.                                     |
| `WEB_URL`                                                                      | Playwright                           | Base URL for end-to-end tests. Default `http://localhost:3000`. |
| `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | `tools/seed-e2e-users.ts`, e2e specs | Test accounts. Passwords have no default.                       |
| `E2E_FULL_STACK`                                                               | e2e specs                            | `1` runs the specs that need the full stack.                    |

Related: [Deploy checklist](../operate/deploy-checklist/_index.md), [Add a staging environment](../operate/add-a-staging-environment.md).
