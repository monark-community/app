# Development guide

Local **setup**, **run**, and **test** for the Monark app. For production **deploy**, see [deploy-checklist.md](deploy-checklist.md). For the deeper "how do I do X correctly" conventions, see the guidelines under [docs/agents/](../agents/) (schema changes, testing, module authoring, i18n, user docs).

## Prerequisites

- **Node ≥ 22** — `.nvmrc` pins `22` ; `nvm use` picks it up.
- **pnpm 10** — run `corepack enable` once and you get the pinned `pnpm@10.13.1`.
- **Docker** (Docker Desktop / OrbStack / colima) — required for the local Supabase stack and for integration-test containers.
- The **Supabase CLI** ships as a dev dependency ; you invoke it as `pnpm exec supabase` (no separate install).

## Quick start

```sh
corepack enable
nvm use                 # Node 22
pnpm bootstrap
```

`pnpm bootstrap` does the whole first-run in order : a preflight (Node / pnpm / Docker reachable), copies each `.env.example` → `.env` (root, `packages/db`, `services/api`, `services/web` ; never overwriting an existing `.env`), `pnpm install`, `pnpm exec supabase start`, and `pnpm db:migrate`. Add `--no-supabase` to skip Docker/Supabase and bring your own Postgres (set `DATABASE_URL` / `DIRECT_URL` yourself).

Then fill in the secrets (below) and run :

```sh
pnpm exec supabase start   # if it isn't already up
pnpm dev
```

Web → <http://localhost:3000>, api → <http://localhost:4000>.

## Environment

`bootstrap` copies the templates ; you fill in the blanks. Get the local Supabase values with `pnpm exec supabase status` and paste them in. Each `.env.example` documents every variable inline — the load-bearing ones :

- **`services/api/.env`** — `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`, `TOTP_ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `CRON_SECRET`, `SMTP_URL` (defaults to the local Inbucket at `smtp://localhost:54325`), `INITIAL_ORG_SLUG` / `INITIAL_ORG_NAME` (the single-tenant bootstrap org), `WEB_ORIGIN` / `APP_URL`, `PORT` (4000).
- **`services/web/.env`** — `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL` (`http://localhost:4000`), and the **server-only** `SUPABASE_URL` / `SUPABASE_SECRET_KEY` (never `NEXT_PUBLIC_*` — the browser must never see the secret key).
- **`packages/db/.env`** — `DATABASE_URL` + `DIRECT_URL` must be **duplicated here** : the Prisma CLI reads env from the schema's own package, not from `services/api`.

Generate the three at-rest secrets (`TOTP_ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `CRON_SECRET`) with :

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Never commit a real value. With `SMTP_URL` unset, outbound mail is **logged, not sent**.

## Run

`pnpm dev` runs both services concurrently via Turbo (persistent, un-cached) : web on `:3000` (`next dev --turbopack`) and api on `:4000` (`tsx watch`). The local Supabase stack must be up first — `pnpm exec supabase start` is idempotent, so it's a fast no-op when already running. If the api logs `Can't reach database server at localhost:54322`, the stack is down.

Local services + ports :

| Service                                          | Port  |
| ------------------------------------------------ | ----- |
| web                                              | 3000  |
| api                                              | 4000  |
| Supabase API (`SUPABASE_URL`)                    | 54321 |
| Postgres                                         | 54322 |
| Supabase Studio                                  | 54323 |
| Mail — Inbucket **web UI** (browse caught email) | 54324 |
| Mail — Inbucket **SMTP listener** (`SMTP_URL`)   | 54325 |

Dev-tool shortcuts open the local consoles :

- `pnpm dev:tools:mail` — Inbucket (caught email) at `:54324`.
- `pnpm dev:tools:supabase` — Supabase Studio.
- `pnpm dev:tools:db` — Prisma Studio.
- `pnpm dev:tools:all` — all three.

## Database

The Prisma schema is **assembled by codegen**, so `pnpm gen` runs before you migrate (it also regenerates the event union + tRPC router). Scripts run per-package via `pnpm --filter @monark/db <script>` ; the root exposes only `db:migrate` and `db:reset` :

| Script           | Does                                                               |
| ---------------- | ------------------------------------------------------------------ |
| `db:generate`    | Regenerate the Prisma client.                                      |
| `db:migrate`     | `prisma migrate deploy` — apply committed migrations (prod-style). |
| `db:migrate:dev` | `prisma migrate dev` — create + apply a new migration in dev.      |
| `db:reset`       | Drop + re-apply + reseed.                                          |
| `db:studio`      | Prisma Studio GUI.                                                 |
| `db:seed`        | Seed (a no-op placeholder today).                                  |

Typical change flow : edit `base.prisma` (core) or a module's `prisma/<module>.prisma` fragment → `pnpm gen` → `pnpm --filter @monark/db db:migrate:dev`. **Watch the GIN-index drift gotcha** when creating a migration — see [schema-changes](../agents/schema-changes.md).

## Test

| Command                                                                         | Runs                                                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm test`                                                                     | Unit tests across every package.                                                                             |
| `pnpm test:integration`                                                         | Integration tests (serialized ; each boots a throwaway Postgres testcontainer — **Docker must be running**). |
| `pnpm test:e2e`                                                                 | Playwright end-to-end (full stack : Supabase + api + web).                                                   |
| `pnpm test:coverage` / `pnpm test:integration:coverage` → `pnpm coverage:merge` | Coverage, fused and checked against the per-package floors.                                                  |

Run a single package's integration suite with `pnpm --filter <pkg> test:integration` (e.g. `pnpm --filter @monark/calendar test:integration`). Integration and e2e suites only run when Docker (and, for e2e, the full stack) is available. See [testing](../agents/testing.md) for how the harness works and how to add a test.

## Pre-PR gate

Run what CI runs, in order — `gen` first so a stale generated file doesn't fail `typecheck` :

```sh
pnpm gen && pnpm typecheck && pnpm lint && pnpm test && pnpm check:tiers && pnpm check:modules && pnpm check:i18n && pnpm check:mcp
```

Git hooks already run prettier + eslint on commit and `pnpm lint` on push. `pnpm check:migrations` (migrations reproduce the schema) needs a `SHADOW_DATABASE_URL` pointing at an empty Postgres, so run it separately when you've touched migrations.

## Deploy

Production runs the web on **Vercel** and the api + cron jobs on **Render**, against a managed **Supabase** project. The full step-by-step (secrets, env vars, smoke test, custom domains) is in [deploy-checklist.md](deploy-checklist.md).

## Doing more

The task-shaped conventions live under [docs/agents/](../agents/) : [module-authoring](../agents/module-authoring.md), [schema-changes](../agents/schema-changes.md), [testing](../agents/testing.md), [i18n](../agents/i18n.md), and [user-doc](../agents/user-doc.md). The architecture + layout reference is [architecture.md](architecture.md) ; the authoritative as-is picture is [platform-overview.md](platform-overview.md).
