---
type: runbook
---

# Prepare accounts and secrets

Do this before creating any service: it produces every credential Render and Vercel ask for. About 20 minutes, most of it waiting for DNS.

## Before you start

- [ ] A Supabase account
- [ ] An account with a transactional mail provider (Resend, Postmark, SES, Mailgun or similar) and a domain you can add DNS records to
- [ ] A password manager to store what you generate
- [ ] `openssl` (Git Bash on Windows includes it)

## Steps

1. Generate four secrets, one per line of output:
   ```sh
   openssl rand -hex 32   # TOTP_ENCRYPTION_KEY
   openssl rand -hex 32   # SECRETS_ENCRYPTION_KEY
   openssl rand -hex 32   # EMAIL_ACTION_SECRET
   openssl rand -hex 32   # CRON_SECRET
   ```
   Each line is 64 hex characters. Store them, labelled, in your password manager. Never reuse them across instances or environments: changing `TOTP_ENCRYPTION_KEY` later invalidates every two-factor enrollment, and changing `SECRETS_ENCRYPTION_KEY` makes every stored org secret unreadable.
2. In Supabase, create a project in a region close to where you'll run Render and Vercel.
3. Under **Project Settings → API**, copy the project URL, the publishable key and the secret key.
4. Under **Project Settings → Database**, copy the transaction pooler URL (port 6543) as `DATABASE_URL` and the direct connection URL (port 5432) as `DIRECT_URL`. Replace `[YOUR-PASSWORD]` in both with the database password.
5. Under **Authentication → Providers**, make sure **Email** is enabled. Leave the URL configuration for later; the web URL doesn't exist yet.
6. At your mail provider, create an API key and verify your sending domain (DKIM and SPF records). Build the SMTP URL from it:
   ```text
   smtps://<username>:<password>@<host>:465
   ```
   For Resend this is `smtps://resend:<API_KEY>@smtp.resend.com:465`. Use `smtp://…:587` if your provider expects STARTTLS.
7. In Supabase, under **Authentication**, set custom SMTP to the same provider. Supabase sends the signup confirmation, password reset and email change messages itself, and its built-in sender is rate-limited.

## Verify

- Your password manager holds four 64-character secrets, the Supabase URL and both keys, both database URLs, and the SMTP URL.
- The mail provider shows the sending domain as verified.

## If something goes wrong

| Symptom                                      | Cause                                  | Fix                                                                                          |
| -------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `openssl: command not found`                 | not installed                          | Run `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` instead. |
| Domain stays unverified at the mail provider | DNS records not propagated or mistyped | Wait up to an hour, then compare the records with the provider's.                            |

Next: [Deploy the api to Render](deploy-the-api-to-render.md)
