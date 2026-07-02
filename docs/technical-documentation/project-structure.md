# Project Structure

Reference documentation for the Monark App monorepo layout and tooling. Based on the shipped Phase 0 specification ; see [features-planning/phase-0/project-scaffolding.md](../features-planning/phase-0/project-scaffolding.md) for the full design rationale.

## Directory tree

```
app/
├── services/
│   ├── api/             # Express 5 + tRPC v11 host
│   └── web/             # Next.js App Router + Tailwind v4
├── packages/
│   ├── db/              # Prisma schema + generated client
│   ├── common/          # event bus, errors, logger, tRPC primitives, Result
│   ├── shared/          # portable utilities
│   ├── components/      # app-specific UI compositions (shadcn via @monark/ui)
│   ├── branding/        # brand config (logo, colours, app name)
│   └── <modules>/       # business modules (@monark/auth, @monark/rbac, etc.)
├── tools/
│   ├── check-tiers.ts   # extended-to-extended dep guard
│   ├── gen-module.ts    # scaffold a new module package
│   ├── gen-events.ts    # regenerate the DomainEvent union
│   └── gen-routers.ts   # regenerate the tRPC app-router composition
├── docs/
│   ├── user-guide/           # end-user documentation
│   ├── features-planning/    # per-phase specs (historical for shipped phases)
│   ├── technical-documentation/  # developer reference (this folder)
│   └── todo/                 # backlog
├── supabase/                 # Supabase config + email templates
├── modules.manifest.ts       # single source of truth for the module graph
├── turbo.json
├── tsconfig.base.json
├── vitest.shared.ts          # shared test config
├── eslint.config.mjs
├── pnpm-workspace.yaml
└── package.json
```

## Module manifest

`modules.manifest.ts` at the repo root is the single source of truth for which modules exist and their tier (core / extended). The codegen tools and the tier-check script both read from it.

## Infrastructure packages

| Package              | Purpose                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `@monark/db`         | Prisma schema + generated client. Every module that needs the database imports from here.    |
| `@monark/common`     | Event bus runtime, shared errors, `Result` type, pino logger, tRPC primitives. Backend-only. |
| `@monark/shared`     | Portable utilities with no framework dependencies. Importable from both services.            |
| `@monark/components` | App-specific UI compositions. Consumes shadcn components via the `@monark/ui` registry.      |
| `@monark/branding`   | Brand config (logo path, app name, colours). Used by services and email templates.           |

## Codegen tools

All tools live in `tools/` and run via pnpm scripts :

| Command                                        | What it does                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm gen:module <name> --tier core\|extended` | Scaffold a new module package with `/server`, `/client`, `/contracts` entry points. Registers in the manifest. |
| `pnpm gen:events`                              | Regenerate `packages/common/src/contracts/events.generated.ts` from every module's event definitions.          |
| `pnpm gen:routers`                             | Regenerate `services/api/src/trpc/app-router.generated.ts` from every module's server router.                  |
| `pnpm gen`                                     | Run all codegen steps.                                                                                         |
| `pnpm check:tiers`                             | Enforce the core/extended dependency rules from the manifest.                                                  |

Add `--check` to `gen:events` or `gen:routers` in CI to fail on drift without overwriting.

## Available scripts

| Script            | What it does                                             |
| ----------------- | -------------------------------------------------------- |
| `pnpm dev`        | Launch web (:3000) + api (:4000) concurrently via Turbo. |
| `pnpm build`      | Topological build across the workspace.                  |
| `pnpm lint`       | ESLint across every package.                             |
| `pnpm typecheck`  | `tsc --noEmit` across every package.                     |
| `pnpm test`       | Vitest across every package.                             |
| `pnpm test:e2e`   | Playwright against running web + api.                    |
| `pnpm db:migrate` | Prisma migrate deploy (via `@monark/db`).                |
| `pnpm db:reset`   | Drop + reseed database.                                  |

## Tech stack

| Layer    | Technology                                                       |
| -------- | ---------------------------------------------------------------- |
| Frontend | Next.js (App Router), React, Tailwind v4, shadcn via @monark/ui  |
| Backend  | Express 5, tRPC v11, pino logger                                 |
| Database | PostgreSQL via Supabase, Prisma ORM                              |
| Auth     | Supabase Auth + custom TOTP / trusted-device logic               |
| Testing  | Vitest (unit/integration), Playwright (e2e), @vitest/coverage-v8 |
| CI       | GitHub Actions (lint → typecheck → test → e2e)                   |
| Monorepo | pnpm workspaces, Turborepo                                       |
