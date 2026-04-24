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
│   └── features-planning/    # per-feature specs, grouped by phase
├── modules.manifest.ts
├── turbo.json
├── tsconfig.base.json
└── pnpm-workspace.yaml
```

Business module packages (`@monark/auth`, `@monark/rbac`, `@monark/voting`, …) land under `packages/` as they are implemented. Generate one with `pnpm gen:module <name> --tier core|extended`.

## Getting started

Requires Node 22 LTS (see [.nvmrc](.nvmrc)) and pnpm 10.

```bash
pnpm install              # installs workspace deps; runs prisma generate in @monark/db
pnpm gen                  # regenerates events.generated.ts + app-router.generated.ts
pnpm dev                  # web on :3000, api on :4000
```

The services point at each other via `NEXT_PUBLIC_API_URL` and `WEB_ORIGIN`. Copy `.env.example` to `.env` in each of `services/web/` and `services/api/` before running.

See [SCAFFOLDING.md](SCAFFOLDING.md) for the current Phase 0 state and known follow-ups.

## Available scripts

Run from the repository root.

| Script | What it does |
|---|---|
| `pnpm dev` | Launch web + api concurrently (turbo-orchestrated) |
| `pnpm build` | Topological build across the workspace |
| `pnpm lint` | ESLint across every package |
| `pnpm typecheck` | `tsc --noEmit` across every package |
| `pnpm test` | Vitest across every package |
| `pnpm test:e2e` | Playwright against running web + api |
| `pnpm db:migrate` | Prisma migrate deploy (via `@monark/db`) |
| `pnpm db:reset` | Drop + reseed database |
| `pnpm check:tiers` | Enforce no extended-to-extended dependencies |
| `pnpm gen` | Run every codegen step (events + routers) |
| `pnpm gen:module <name> --tier core\|extended` | Scaffold a new module package |
| `pnpm gen:events` | Regenerate the `DomainEvent` union (add `--check` in CI) |
| `pnpm gen:routers` | Regenerate the tRPC app router (add `--check` in CI) |

## Documentation

- [SCAFFOLDING.md](SCAFFOLDING.md); current Phase 0 state, first-run steps, known follow-ups.
- [docs/features-planning/](docs/features-planning/); per-feature implementation specs grouped by phase.
- [docs/features-planning/phase-0/modular-architecture.md](docs/features-planning/phase-0/modular-architecture.md); two-tier module architecture.
- [docs/features-planning/phase-0/project-scaffolding.md](docs/features-planning/phase-0/project-scaffolding.md); concrete layout and tooling.

## Deployment

Production deployment is not yet wired. Candidate targets: Vercel for `services/web`, Fly.io or Railway for `services/api`, Supabase-hosted Postgres for the database. Tracked as a follow-up in [SCAFFOLDING.md](SCAFFOLDING.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for community expectations.

## Security

Please see [SECURITY.md](./SECURITY.md) for how to report vulnerabilities.

## License

Apache License 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for details.
