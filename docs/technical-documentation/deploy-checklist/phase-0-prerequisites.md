# Phase 0 : Prerequisites

### 0.1 Generate the deploy-time secrets

Three values you'll paste into Render. Generate them once, store in your password manager :

```sh
# Linux / macOS / Git Bash on Windows
openssl rand -hex 32   # → TOTP_ENCRYPTION_KEY (32 bytes hex = 64 chars)
openssl rand -hex 32   # → SECRETS_ENCRYPTION_KEY (org-secrets store ; separate key from TOTP)
openssl rand -hex 32   # → CRON_SECRET
```

These are operator secrets ; never commit, never share over chat. Rotating `TOTP_ENCRYPTION_KEY` invalidates every existing TOTP enrollment ; rotating `SECRETS_ENCRYPTION_KEY` invalidates every stored org secret (webhook + integration credentials must be re-entered) ; rotating `CRON_SECRET` is harmless mid-month.

### 0.2 Create a production Supabase project

[supabase.com](https://supabase.com) → New project. Pick a region close to where you'll deploy Vercel + Render (us-west, us-east, eu-central are common pairings).

After it provisions :

- **Project Settings → API** : copy `URL`, `publishable` key (formerly "anon"), `secret` key (formerly "service_role").
- **Project Settings → Database** : copy the `Transaction pooler` URL (port 6543) for `DATABASE_URL` and the `Direct connection` URL (port 5432) for `DIRECT_URL`. Replace `[YOUR-PASSWORD]` with the real password from the dashboard.
- **Authentication → URL Configuration** : leave the Site URL empty for now ; we'll fill it in Phase 5 once the Vercel URL exists.
- **Authentication → Providers → Email** : enable. Disable any other providers you don't intend to support yet.

### 0.3 Set up SMTP

Pick a provider. Resend is the simplest :

1. [resend.com](https://resend.com) → API Keys → create.
2. Add a verified sender domain (DNS DKIM + SPF records).
3. The SMTP URL format is `smtps://resend:<API_KEY>@smtp.resend.com:465`.

Postmark / SES / Brevo / Mailgun all work the same way ; `smtps://username:password@host:port` (or `smtp://...` on port 587 if you prefer STARTTLS).

---
