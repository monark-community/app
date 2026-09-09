# 1.3 Fill `monark-api` env vars

Most are operator-set (`sync: false` in [render.yaml](../../../../render.yaml)). Render prompts for them on first deploy.

| Key                         | Value                                                                      |
| --------------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`              | Supabase pooler URL (port 6543)                                            |
| `DIRECT_URL`                | Supabase direct connection URL (port 5432)                                 |
| `SUPABASE_URL`              | from 0.2                                                                   |
| `SUPABASE_PUBLISHABLE_KEY`  | from 0.2                                                                   |
| `SUPABASE_SECRET_KEY`       | from 0.2                                                                   |
| `WEB_ORIGIN`                | `https://monark.vercel.app` ← placeholder, updated in Phase 3              |
| `APP_URL`                   | `https://monark.vercel.app` ← same                                         |
| `SMTP_URL`                  | from 0.3                                                                   |
| `SMTP_FROM`                 | `Monark <noreply@yourdomain.com>`                                          |
| `TOTP_ENCRYPTION_KEY`       | from 0.1                                                                   |
| `SECRETS_ENCRYPTION_KEY`    | from 0.1 (org-secrets store ; required once any secret-using module is on) |
| `INITIAL_ORG_SLUG`          | `monark` (or whatever slug your singleton org should have)                 |
| `INITIAL_ORG_NAME`          | `Monark` (or your display name)                                            |
| `INITIAL_ORG_PRIMARY_COLOR` | `"#2563EB"` ; your brand color, **quoted**. Themes the whole running UI    |
| `WEBHOOK_SECRETS_JSON`      | leave blank for now ; fill once you create webhook endpoints               |

> **Quote any value that starts with `#`.** Node's `--env-file` parser reads an
> unquoted leading `#` as a comment, so `INITIAL_ORG_PRIMARY_COLOR=#2563EB`
> resolves to an empty string. Same for `BRANDING_PRIMARY` / `BRANDING_ACCENT`.

Optional, depending on your setup :

- **Error tracking** : set `SENTRY_DSN` to turn on server-side Sentry (a complete no-op if unset). See [observability.md](../.././observability.md).
- **White-label branding** : set the `BRANDING_*` vars (`BRANDING_APP_NAME`, `BRANDING_TAGLINE`, `BRANDING_SUPPORT_EMAIL`, `BRANDING_PRIMARY`, `BRANDING_FROM_EMAIL`, `BRANDING_TOTP_ISSUER`, …) to your product's identity ; each is optional and falls back to the neutral starter default. See [white-label.md](../.././white-label/_index.md). Three surfaces are **not** covered by env and need a file edit before launch : the favicon, the three Supabase auth email templates, and the org logo (uploaded in-app). white-label.md's retargeting checklist walks all of them.
