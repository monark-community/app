---
type: runbook
---

# Run several instances

Serve several businesses by running one independent instance per business, each with its own database, domain and branding. Monark is single-tenant: one deployment serves one organization. About an hour per new instance.

```text
Cloudflare (DNS, TLS, WAF per domain)
   ├── app.acme.com / api.acme.com     → instance A: api + web + Supabase A
   └── app.globex.io / api.globex.io   → instance B: api + web + Supabase B
```

The api ships as one container image with no secrets baked in and no migrations on boot, so every instance runs the same image with a different environment file.

## Before you start

- [ ] Docker and a container registry
- [ ] A container host (Render with Docker, Fly, Cloud Run, ECS, Kubernetes or a VPS)
- [ ] A Cloudflare account, and the client's domain
- [ ] For each instance: its own Supabase project and mail sending domain

## Steps

1. Build and push the api image once per release, from the repository root:
   ```sh
   docker build -f services/api/Dockerfile -t <registry>/monark-api:<version> .
   docker push <registry>/monark-api:<version>
   ```
2. Write `clients/<client>.env` and keep it in a secret store, not the repository. These keys differ per instance:

   | Group        | Keys                                                                                                                   |
   | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
   | Database     | `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`                        |
   | URLs         | `WEB_ORIGIN`, `APP_URL` (`https://app.<client-domain>`)                                                                |
   | Organization | `INITIAL_ORG_SLUG`, `INITIAL_ORG_NAME`, `INITIAL_ORG_PRIMARY_COLOR`                                                    |
   | Branding     | `BRANDING_*` ([Rebrand an instance](rebrand-an-instance.md))                                                           |
   | Mail         | `SMTP_URL`, `SMTP_FROM`                                                                                                |
   | Keys         | `TOTP_ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `EMAIL_ACTION_SECRET`, `CRON_SECRET`: freshly generated, never shared |
   | Monitoring   | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`                                                                                     |

   Add `NODE_ENV=production`. The full list is in [Environment variables](../reference/environment-variables.md). Unlike a `.env` file, Docker's `--env-file` keeps quotes as part of the value, so write hex colours unquoted here: `INITIAL_ORG_PRIMARY_COLOR=#2563EB`.

3. Migrate the client's database with the same image, before the new version goes live:
   ```sh
   docker run --rm --env-file clients/<client>.env <registry>/monark-api:<version> \
     pnpm --filter @monark/db exec prisma migrate deploy
   ```
   Re-running on an up-to-date database changes nothing.
4. Run the api:
   ```sh
   docker run -d --env-file clients/<client>.env -p 4000:4000 <registry>/monark-api:<version>
   ```
   On first boot it creates the organization from `INITIAL_ORG_*`. To create it without a restart, run `pnpm provision:org` in the container the same way as step 3.
5. Schedule two calls against the instance's api, with header `Authorization: Bearer <CRON_SECRET>`: `POST /cron/process-account-deletions` daily, and `POST /cron/sweep-webhook-deliveries` every 5 minutes. The api runs its other background work itself.
6. Deploy the web app as one Vercel project per client, with that client's `NEXT_PUBLIC_*` values and `SUPABASE_URL` / `SUPABASE_SECRET_KEY`, as in [Deploy the web app to Vercel](deploy-checklist/deploy-the-web-app-to-vercel.md).
7. In Cloudflare, add the client's domain as a zone and create proxied records: `app.<client-domain>` to the web app and `api.<client-domain>` to the api host.
8. Set `NEXT_PUBLIC_API_URL=https://api.<client-domain>` on the web project, and in the client's Supabase project set **Site URL** and the `/auth/confirm` and `/auth/callback` redirect URLs to `https://app.<client-domain>`.

## Verify

```sh
curl -s https://api.<client-domain>/health
```

Expect `{"status":"ok","service":"api"}`. Then run the [smoke test](deploy-checklist/smoke-test-a-deployment.md) against `https://app.<client-domain>`.

## If something goes wrong

| Symptom                                         | Cause                                                    | Fix                                                |
| ----------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Browser calls to the api fail with a CORS error | `WEB_ORIGIN` is the origin host, not the client's domain | Set it to `https://app.<client-domain>`.           |
| Container marked unhealthy                      | the api exited at boot                                   | Read the container log for `Invalid environment:`. |
| `invalid INITIAL_ORG_PRIMARY_COLOR` at boot     | the hex value is quoted in the Docker env file           | Remove the quotes.                                 |
| Users of one client see another client's data   | two instances share a database URL                       | Give each instance its own Supabase project.       |
| Account deletions never complete                | the daily cron call isn't scheduled                      | Add it as in step 5.                               |

Next: [Run a second instance on your machine](run-a-second-instance-on-your-machine.md)
