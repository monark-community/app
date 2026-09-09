# Environment

`bootstrap` copies the templates and fills the local ones ; you fill in the rest. Each `.env.example` documents every variable inline ; the load-bearing ones :

- **`services/api/.env`** : `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`, `TOTP_ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `CRON_SECRET`, `SMTP_URL` (defaults to the local Inbucket at `smtp://localhost:54325`), `INITIAL_ORG_SLUG` / `INITIAL_ORG_NAME` (the single-tenant bootstrap org), `WEB_ORIGIN` / `APP_URL`, `PORT` (4000).
- **`services/web/.env`** : `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL` (`http://localhost:4000`), and the **server-only** `SUPABASE_URL` / `SUPABASE_SECRET_KEY` (never `NEXT_PUBLIC_*` ; the browser must never see the secret key).
- **`packages/db/.env`** : `DATABASE_URL` + `DIRECT_URL` must be **duplicated here** : the Prisma CLI reads env from the schema's own package, not from `services/api`.

`bootstrap` generates the three at-rest secrets (`TOTP_ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `CRON_SECRET`) for you locally. To mint one yourself (rotating a key, or filling a production env) use :

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

**Quote any value starting with `#`.** Node's `--env-file` parser reads an unquoted leading `#` as a comment, so `INITIAL_ORG_PRIMARY_COLOR=#2563EB` silently resolves to an empty string ; write `INITIAL_ORG_PRIMARY_COLOR="#2563EB"`. The same applies to `BRANDING_PRIMARY` / `BRANDING_ACCENT`.

Never commit a real value. With `SMTP_URL` unset, outbound mail is **logged, not sent**.
