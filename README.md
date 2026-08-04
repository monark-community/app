# Monark App

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
![GitHub Issues](https://img.shields.io/github/issues/monark-community/app)
![GitHub Pull Requests](https://img.shields.io/github/issues-pr/monark-community/app)
![GitHub Stars](https://img.shields.io/github/stars/monark-community/app)
![GitHub Forks](https://img.shields.io/github/forks/monark-community/app)

Monark App is the central hub for the Monark Web3 community. It serves five user types (Admin, Moderator, Developer, Student, Ambassador) and focuses on executive priorities: contribution quantification for reward distribution, decentralized voting, referral-system integration, automated marketing content, and centralization of living project data.

## Overview

The app is a pnpm monorepo containing two thin runnable services and a set of business-logic packages; each business domain (auth, rbac, voting, etc.) is its own workspace package with three public entry points (`/server`, `/client`, `/contracts`). Workspace package boundaries are the module boundaries; the internals of one module are physically unreachable from another. See [docs/features-planning/phase-0/modular-architecture.md](docs/features-planning/phase-0/modular-architecture.md) for the full rationale.

## Key features (targeted)

These are the features this app is being built to deliver. See [docs/features-planning/](docs/features-planning/) for the full per-feature specification.

- 🛡 Role-based access, TOTP 2FA, trusted-device recognition
- 🏛 Decentralized community voting with role-scoped ballots
- 📊 Contribution estimation from onboarding, voting, and external activity
- 🔗 Referral-system integration with Monark's existing backend
- 📣 Automated marketing content from preconfigured dynamic layouts
- 📚 Centralization of living project data (statuses, docs, team pictures)

## Project structure

```
app/
├── services/
│   ├── api/             # Express 5 + tRPC v11 host
│   └── web/             # Next.js App Router + Tailwind v4
├── packages/
│   ├── db/              # Prisma schema + generated client
│   ├── common/          # event bus, errors, logger, tRPC primitives, Result
│   ├── shared/          # portable utilities
│   └── components/      # app-specific UI compositions (shadcn via @monark/ui)
├── tools/
│   ├── check-tiers.ts   # extended-extended dep guard
│   ├── gen-module.ts    # scaffold a new module package
│   ├── gen-events.ts    # regenerate the DomainEvent union
│   └── gen-routers.ts   # regenerate the tRPC app-router composition
├── docs/
│   └── features-planning/    # per-feature specs (shipped, by phase) + proposed/
├── modules.manifest.ts
├── turbo.json
├── tsconfig.base.json
└── pnpm-workspace.yaml
```

Business module packages (`@monark/auth`, `@monark/rbac`, `@monark/voting`, …) land under `packages/` as they are implemented. Generate one with `pnpm gen:module <name> --tier core|extended`.

## Getting started

Requires :

- **Node 22 LTS** (see [.nvmrc](.nvmrc)) ; install with nvm / fnm / volta.
- **pnpm 10** ; `corepack enable` is the simplest path (corepack ships with Node 22+ and picks up the version pinned in this repo's `packageManager` field).
- **Docker** ; Supabase's local stack (Postgres + Auth + Inbucket mail catcher) runs in containers. Docker Desktop / OrbStack / colima all work.

### First-time setup (one command)

```bash
pnpm bootstrap
```

This runs : Node + pnpm + Docker preflight → copies `.env.example` → `.env` in every service that ships one (never overwrites operator-set values) → `pnpm install --frozen-lockfile` → `supabase start` → `pnpm db:migrate`. Idempotent ; safe to re-run on a healthy install.

If Docker isn't available and you want to bring your own Postgres :

```bash
pnpm bootstrap --no-supabase
```

`bootstrap` then only handles install + env copy ; you point `DATABASE_URL` / `DIRECT_URL` at your own DB and run `pnpm db:migrate` manually.

### Daily dev loop

Once bootstrap has run, the daily loop is :

```bash
pnpm exec supabase start  # boots Postgres + Auth + Inbucket if they're down
pnpm dev                   # web on :3000, api on :4000 (turbo-orchestrated)
```

`supabase start` is idempotent — fast-no-op when the stack is already running. Helper aliases for the dev tools :

```bash
pnpm dev:tools:mail        # opens Inbucket at http://localhost:54324
pnpm dev:tools:supabase    # opens Supabase Studio
pnpm dev:tools:db          # opens Prisma Studio
pnpm dev:tools:all         # all three at once
```

If `pnpm dev` fails with `Can't reach database server at localhost:54322`, the stack isn't running ; run `pnpm exec supabase start` first.

### Services point at each other

`NEXT_PUBLIC_API_URL` and `WEB_ORIGIN` cross-wire the two services. The default `.env.example` values target the local stack ; production values for both flow through Vercel + Render's dashboards (see [docs/technical-documentation/deploy-checklist.md](docs/technical-documentation/deploy-checklist.md)).

See [docs/features-planning/phase-0/scaffolding-status.md](docs/features-planning/phase-0/scaffolding-status.md) for the Phase 0 scaffolding record and known follow-ups.

## Available scripts

Run from the repository root.

| Script                                         | What it does                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm bootstrap`                               | First-time setup ; preflight + env copy + install + `supabase start` + `pnpm db:migrate`  |
| `pnpm dev`                                     | Launch web + api concurrently (turbo-orchestrated)                                        |
| `pnpm build`                                   | Topological build across the workspace                                                    |
| `pnpm lint`                                    | ESLint across every package                                                               |
| `pnpm typecheck`                               | `tsc --noEmit` across every package                                                       |
| `pnpm test`                                    | Vitest across every package                                                               |
| `pnpm test:coverage`                           | Unit tests with coverage per package                                                      |
| `pnpm test:integration`                        | Integration tests against a Postgres testcontainer                                        |
| `pnpm test:integration:coverage`               | Integration tests with coverage                                                           |
| `pnpm coverage:merge`                          | Fuse unit + integration coverage into per-package `coverage/lcov.info` + check thresholds |
| `pnpm test:e2e`                                | Playwright against running web + api (manual ; CI runs via `.github/workflows/e2e.yml`)   |
| `pnpm db:migrate`                              | Prisma migrate deploy (via `@monark/db`)                                                  |
| `pnpm db:reset`                                | Drop + reseed database                                                                    |
| `pnpm check:tiers`                             | Enforce no extended-to-extended dependencies                                              |
| `pnpm gen`                                     | Run every codegen step (events + routers)                                                 |
| `pnpm gen:module <name> --tier core\|extended` | Scaffold a new module package                                                             |
| `pnpm gen:events`                              | Regenerate the `DomainEvent` union (add `--check` in CI)                                  |
| `pnpm gen:routers`                             | Regenerate the tRPC app router (add `--check` in CI)                                      |
| `pnpm sysadmin grant <userId\|email>`          | Grant platform-tier `SYSADMIN` to a user (operator break-glass)                           |

## Documentation

- [docs/features-planning/phase-0/scaffolding-status.md](docs/features-planning/phase-0/scaffolding-status.md); Phase 0 scaffolding record, first-run steps, known follow-ups.
- [docs/features-planning/](docs/features-planning/); per-feature implementation specs grouped by phase.
- [docs/features-planning/phase-0/modular-architecture.md](docs/features-planning/phase-0/modular-architecture.md); two-tier module architecture.
- [docs/features-planning/phase-0/project-scaffolding.md](docs/features-planning/phase-0/project-scaffolding.md); concrete layout and tooling.

## Deployment

Single-tenant production deploys target **Vercel** (web) + **Render** (api + scheduled cron jobs) + **managed Supabase Postgres**. Both deploy specs live in code :

- [render.yaml](render.yaml) — Render Blueprint : `monark-api` Web Service + `monark-cron-deletions` + `monark-cron-webhook-sweep` + shared env-var group.
- [services/web/vercel.json](services/web/vercel.json) + [services/web/DEPLOY.md](services/web/DEPLOY.md) — Vercel project config + manual UI steps.

Step-by-step walkthrough for a fresh deploy : [docs/technical-documentation/deploy-checklist.md](docs/technical-documentation/deploy-checklist.md). Allow ~60 min the first time ; re-deploys take ~5 min.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for community expectations.

## Security

Please see [SECURITY.md](./SECURITY.md) for how to report vulnerabilities.

## License

Apache License 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for details.
