# Running multiple isolated instances

The app is a **single-tenant** product: one deployment serves one business (one
organization). To serve many businesses you run **many independent instances** —
each with its own database, its own domain, and its own branding — rather than
one multi-tenant deployment. This fits everything the starter already does: the
`BRANDING_*` env seam, the `provision:org` CLI, and the singleton-org bootstrap
are all per-deployment.

```
Cloudflare (DNS + proxy/TLS/WAF per domain)
   ├── acme.com        → instance A : api + web + Supabase-A   (org "Acme")
   ├── globex.io       → instance B : api + web + Supabase-B   (org "Globex")
   └── …               → instance N : …
```

Each instance is a normal production deploy (the [deploy-checklist.md](deploy-checklist.md)
walkthrough); this doc is what's _different_ when you run several. The api ships
as a container so instance N is "same image, different env file."

## The API image

[`services/api/Dockerfile`](../../services/api/Dockerfile) builds one
**env-agnostic** image — it bakes in no secrets and runs no migrations on boot,
so the _same_ image runs staging, production, and every client. Build it once
(context = repo root):

```sh
docker build -f services/api/Dockerfile -t registry/monark-api:<version> .
docker push registry/monark-api:<version>
```

Run an instance by pointing that image at one client's env:

```sh
docker run --rm --env-file clients/acme.env -p 4000:4000 registry/monark-api:<version>
```

This is the **build-once, promote-the-same-artifact** model: the image you smoke
on staging is the exact bytes you run for every client. Run it anywhere that
takes a container — Render (Docker runtime), Fly, Railway, Cloud Run, ECS, k8s,
or a plain VPS.

> The image is the "no bundle" build (full workspace + `tsx`), so it's large
> (~1 GB). A bundled / `pnpm deploy --prod`-pruned image is the size follow-up;
> it doesn't change how you run instances.

## What differs per instance

Everything an instance needs comes from **runtime env** — one env file per
client. The keys that MUST differ:

| Group             | Keys                                                                                                                                  | Per-client value                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Identity**      | `BRANDING_APP_NAME`, `BRANDING_TAGLINE`, `BRANDING_SUPPORT_EMAIL`, `BRANDING_PRIMARY`, `BRANDING_TOTP_ISSUER`, `BRANDING_LOGO_SRC`, … | the client's brand ([white-label.md](white-label.md))             |
| **Database**      | `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`                                       | the client's own Supabase project                                 |
| **URLs**          | `WEB_ORIGIN`, `APP_URL`                                                                                                               | the client's domain (`https://app.acme.com`)                      |
| **Org**           | `INITIAL_ORG_SLUG`, `INITIAL_ORG_NAME`                                                                                                | the client's org                                                  |
| **Mail**          | `SMTP_URL`, `SMTP_FROM`                                                                                                               | the client's sending domain                                       |
| **Crypto**        | `TOTP_ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `CRON_SECRET`                                                                        | **fresh per instance** — never reuse across clients               |
| **Observability** | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`                                                                                                    | e.g. `production` tagged with the client, or a per-client project |

Keep each client's env file in a secret store (not the repo). The web app needs
the `NEXT_PUBLIC_*` mirror of the identity + Supabase + api URL vars per its own
deploy (below).

## Migrations per instance

Run migrations against each client's DB as a **release step**, using the same
image with that client's `DATABASE_URL`/`DIRECT_URL`:

```sh
docker run --rm --env-file clients/acme.env registry/monark-api:<version> \
  pnpm --filter @monark/db exec prisma migrate deploy
```

`migrate deploy` is idempotent, so re-running on an up-to-date DB is a no-op. Do
this before rolling the new image so a bad migration never reaches a live
container. (On Render this is the service's `preDeployCommand`; on k8s an init
container / Job.)

## The org

Each instance is single-tenant. Its org is provisioned from `INITIAL_ORG_*` at
api boot, or on demand with `pnpm provision:org` (see
[tools/provision-org.ts](../../tools/provision-org.ts)) — run it in the container
the same way as the migrate step. Idempotent per instance.

## Cloudflare (per client)

Cloudflare is the DNS + proxy/TLS/WAF layer in front of each instance; it's
agnostic to how the origin runs. Per client domain:

1. Add the domain (or a subdomain of yours) as a Cloudflare zone.
2. Point records at the instance's origins — e.g. `app.acme.com` → the web
   origin and `api.acme.com` → the api origin — **proxied** (orange cloud) so
   Cloudflare terminates TLS and fronts the CDN/WAF.
3. Match the app's config to the domain: set the instance's `WEB_ORIGIN` /
   `APP_URL` to `https://app.acme.com`, the web's `NEXT_PUBLIC_API_URL` to
   `https://api.acme.com`, and the client's **Supabase → Auth → URL
   Configuration** Site URL + redirect URLs to the client domain.

The api's CORS + trusted-device cookie gate on `WEB_ORIGIN`, so it must be the
real client domain, not the origin host.

## The web side

Two options per instance:

- **Vercel project per client** — simplest today. One project per client with
  its own `NEXT_PUBLIC_*` env (client branding + client api + client Supabase),
  its domain added in Vercel, and Cloudflare in front. Reuses the existing web
  deploy path.
- **Self-hosted web container** — a Next.js `output: "standalone"` image so web +
  api both run as containers on your infra (fuller self-host, one platform). Not
  built yet; it's the natural next step if you move web off Vercel.

## Two instances on one dev machine

Everything above is about production. Locally, the constraint is different :
every instance wants the _same_ fixed ports, and `CLAUDE.md` asks each agent to
work in its own worktree — so running two checkouts side by side is the normal
case, not an exotic one.

A second local instance needs three edits in the second worktree :

1. **`supabase/config.toml`** — a distinct `project_id` (this is what names the
   Docker containers, so it's what actually keeps the two stacks apart) and a
   shifted port block. Shift them all together, e.g. `54321`→`55321` :
   `[api] port`, `[db] port` + `shadow_port`, `[db.pooler] port`,
   `[studio] port`, `[inbucket] port` + `smtp_port`, `[analytics] port`.
2. **`services/web/package.json`** — the `dev` script pins `--port 3000`. Change
   it to the second instance's port. It is a literal flag on purpose : Next
   resolves its port _before_ loading `.env`, so a `PORT=` line there is ignored,
   and passing `PORT` through the environment instead leaks into the api's
   process too (Node's `--env-file` does not override an already-set variable),
   which lands both services on the same port.
3. **The `.env` files** — `PORT` for the api, and `WEB_ORIGIN` / `APP_URL` /
   `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_APP_URL` / the `SUPABASE_URL` pair /
   `SMTP_URL` to match the shifted ports. `pnpm bootstrap` fills the DB URL and
   Supabase keys from whatever `supabase status` reports, so it picks up the
   shift on its own ; the origin URLs are yours to set.

The first two are local-only edits — don't commit them.

## Provisioning a new instance — checklist

1. Create the client's **Supabase** project; copy URL + keys.
2. Write `clients/<client>.env` from the table above (fresh crypto keys).
3. **Migrate**: run `prisma migrate deploy` with that env (above).
4. **Run** the api image with that env; **deploy the web** (Vercel project or web
   container) with the matching `NEXT_PUBLIC_*`.
5. **Cloudflare**: add the domain, point `app.*`/`api.*` at the origins (proxied).
6. Set the client Supabase **Auth URL config** to the client domain.
7. Boot provisions the org from `INITIAL_ORG_*` (or run `provision:org`).
8. Smoke-test against the client domain ([deploy-checklist.md](deploy-checklist.md) Phase 4).
