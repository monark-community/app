---
type: runbook
---

# Smoke-test a deployment

Prove a fresh deployment works end to end and make yourself its administrator. Run it after every first deploy and after a domain change. About 10 minutes.

## Before you start

- [ ] The web app and api are deployed ([Deploy the web app to Vercel](deploy-the-web-app-to-vercel.md))
- [ ] An inbox you can read
- [ ] A local checkout of the repository with `pnpm install` done, and the deployment's `DIRECT_URL`

## Steps

1. Check the api:
   ```sh
   curl -s https://<api-host>/health
   ```
   Expect `{"status":"ok","service":"api"}`.
2. Open the web URL. On the sign-in page, click **Create one**, enter an email and password, and click **Create account**.
3. Open the confirmation email (it arrives within a minute) and click its link. You land in the app, signed in.
4. No account is an administrator yet. Grant yourself the platform administrator role from your local checkout:
   ```sh
   DATABASE_URL="<direct-url>" DIRECT_URL="<direct-url>" pnpm tsx tools/sysadmin.ts grant <your-email>
   ```
   Expect `Granted SYSADMIN to <your-email> (id=…)`. `pnpm tsx tools/sysadmin.ts list` shows every holder.
5. Reload the app and open `https://<web-host>/admin`. The admin sections load.
6. Optional, to test outbound webhooks: get a URL from [webhook.site](https://webhook.site). In **Admin → Webhooks**, click **New endpoint**, enter that URL, subscribe to `rbac.role-created`, and click **Create endpoint**. Then create a role under **Admin → Roles & permissions**. Within a few seconds, webhook.site shows the delivery with a `Webhook-Signature` header.

## Verify

You are signed in, `/admin` loads, and (if you ran step 6) one signed delivery arrived.

## If something goes wrong

| Symptom                                                                   | Cause                                                          | Fix                                                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| No confirmation email                                                     | Supabase custom SMTP not set, or the sending domain unverified | Check **Authentication** SMTP settings in Supabase and the provider's logs.              |
| Sign-in keeps returning to the sign-in page                               | `WEB_ORIGIN` doesn't match the web URL                         | Fix it on the api. Set `MONARK_AUTH_GATE_DEBUG=1` on Vercel to log which gate redirects. |
| `sysadmin` fails with `No user matched`                                   | the email differs, or the account isn't confirmed yet          | Confirm the email first; use the exact address.                                          |
| `sysadmin` fails with `SYSADMIN role row … is missing`                    | migrations didn't run against this database                    | Run `pnpm --filter @monark/db exec prisma migrate deploy` with the same URLs.            |
| Deliveries fail with `no plaintext secret available` after an api restart | the signing secret was only held in memory                     | See [Choose a webhook secret store](../choose-a-webhook-secret-store.md).                |

Next: [Add custom domains](add-custom-domains.md)
