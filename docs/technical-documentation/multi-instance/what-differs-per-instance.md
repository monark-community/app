# What differs per instance

Everything an instance needs comes from **runtime env** ; one env file per
client. The keys that MUST differ:

| Group             | Keys                                                                                                                                  | Per-client value                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Identity**      | `BRANDING_APP_NAME`, `BRANDING_TAGLINE`, `BRANDING_SUPPORT_EMAIL`, `BRANDING_PRIMARY`, `BRANDING_TOTP_ISSUER`, `BRANDING_LOGO_SRC`, … | the client's brand ([white-label.md](../white-label/_index.md))             |
| **Database**      | `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`                                       | the client's own Supabase project                                 |
| **URLs**          | `WEB_ORIGIN`, `APP_URL`                                                                                                               | the client's domain (`https://app.acme.com`)                      |
| **Org**           | `INITIAL_ORG_SLUG`, `INITIAL_ORG_NAME`                                                                                                | the client's org                                                  |
| **Mail**          | `SMTP_URL`, `SMTP_FROM`                                                                                                               | the client's sending domain                                       |
| **Crypto**        | `TOTP_ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `CRON_SECRET`                                                                        | **fresh per instance** ; never reuse across clients               |
| **Observability** | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`                                                                                                    | e.g. `production` tagged with the client, or a per-client project |

Keep each client's env file in a secret store (not the repo). The web app needs
the `NEXT_PUBLIC_*` mirror of the identity + Supabase + api URL vars per its own
deploy (below).
