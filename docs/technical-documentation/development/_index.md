# Development guide

Local **setup**, **run**, and **test** for the Monark app. For production **deploy**, see [deploy-checklist.md](../deploy-checklist/_index.md). For the deeper "how do I do X correctly" conventions, see the guidelines under [docs/agents/](../../agents/) (schema changes, testing, module authoring, i18n, user docs).

## In this section

- **[Environment](environment.md)**
- **[Database](database.md)**
- **[Test](test.md)**

## Prerequisites

- **Node ≥ 22** : `.nvmrc` pins `22` ; `nvm use` picks it up.
- **pnpm 10** : run `corepack enable` once and you get the pinned `pnpm@10.13.1`.
- **Docker** (Docker Desktop / OrbStack / colima) ; required for the local Supabase stack and for integration-test containers.
- The **Supabase CLI** ships as a dev dependency ; you invoke it as `pnpm exec supabase` (no separate install).


## Quick start

```sh
corepack enable
nvm use                 # Node 22
pnpm bootstrap
```

`pnpm bootstrap` does the whole first-run in order : a preflight (Node / pnpm / Docker reachable), copies each `.env.example` → `.env` (root, `packages/db`, `services/api`, `services/web` ; never overwriting an existing `.env`), `pnpm install`, `pnpm exec supabase start`, wires the copied `.env` files to that stack, and `pnpm db:migrate`. Add `--no-supabase` to skip Docker/Supabase and bring your own Postgres (set `DATABASE_URL` / `DIRECT_URL` yourself).

The wiring step fills **blank values only** ; `DATABASE_URL` / `DIRECT_URL` and the Supabase URL + keys read back from `supabase status -o env`, plus locally generated `TOTP_ENCRYPTION_KEY` / `SECRETS_ENCRYPTION_KEY` / `CRON_SECRET`. A value you have already set is never touched, so re-running bootstrap on a configured install is a no-op. What it deliberately leaves blank is everything non-local : SMTP credentials, a Sentry DSN, and your `BRANDING_*` identity.

Then run :

```sh
pnpm exec supabase start   # if it isn't already up
pnpm dev
```

Web → <http://localhost:3000>, api → <http://localhost:4000>.


## Run

`pnpm dev` runs both services concurrently via Turbo (persistent, un-cached) : web on `:3000` (`next dev --turbopack`) and api on `:4000` (`tsx watch`). The local Supabase stack must be up first ; `pnpm exec supabase start` is idempotent, so it's a fast no-op when already running. If the api logs `Can't reach database server at localhost:54322`, the stack is down.

Local services + ports :

| Service                                          | Port  |
| ------------------------------------------------ | ----- |
| web                                              | 3000  |
| api                                              | 4000  |
| Supabase API (`SUPABASE_URL`)                    | 54321 |
| Postgres                                         | 54322 |
| Supabase Studio                                  | 54323 |
| Mail : Inbucket **web UI** (browse caught email) | 54324 |
| Mail : Inbucket **SMTP listener** (`SMTP_URL`)   | 54325 |

Dev-tool shortcuts open the local consoles :

- `pnpm dev:tools:mail` ; Inbucket (caught email) at `:54324`.
- `pnpm dev:tools:supabase` ; Supabase Studio.
- `pnpm dev:tools:db` ; Prisma Studio.
- `pnpm dev:tools:all` ; all three.


## Feature flags on a fresh install

Extended modules ship behind flags that default **off**, so a freshly bootstrapped
install 404s on `/wiki` and friends until they're turned on. For local dev :

```sh
pnpm enable:dev-flags
```

That sets global overrides for the flags a developer normally wants on
(`wiki.enabled`, `chat.*`, `public-api.*`, `data-models.query-language`,
`data-models.public-forms`) without touching the registered defaults ; see
[tools/enable-dev-flags.ts](../../../tools/enable-dev-flags.ts). In a real deploy,
overrides are DB rows against the `FeatureFlag` table ; there is no admin UI for them yet.


## Pre-PR gate

Run what CI runs, in order ; `gen` first so a stale generated file doesn't fail `typecheck` :

```sh
pnpm gen && pnpm typecheck && pnpm lint && pnpm test && pnpm check:tiers && pnpm check:modules && pnpm check:i18n && pnpm check:mcp
```

Git hooks already run prettier + eslint on commit and `pnpm lint` on push. `pnpm check:migrations` (migrations reproduce the schema) needs a `SHADOW_DATABASE_URL` pointing at an empty Postgres, so run it separately when you've touched migrations.


## Deploy

Production runs the web on **Vercel** and the api + cron jobs on **Render**, against a managed **Supabase** project. The full step-by-step (secrets, env vars, smoke test, custom domains) is in [deploy-checklist.md](../deploy-checklist/_index.md).


## Doing more

The task-shaped conventions live under [docs/agents/](../../agents/) : [module-authoring](../../agents/module-authoring.md), [schema-changes](../../agents/schema-changes.md), [testing](../../agents/testing.md), [i18n](../../agents/i18n.md), and [user-doc](../../agents/user-doc.md). The architecture + layout reference is [architecture.md](../architecture/_index.md) ; the authoritative as-is picture is [platform-overview.md](../platform-overview/_index.md).
