---
type: reference
---

# Scripts

Every `pnpm` script in the repository root, plus the per-package scripts you run with `pnpm --filter`. Run root scripts from the repository root.

<!-- source: package.json, packages/db/package.json, services/web/package.json, services/mcp/package.json -->

## Setup and running

| Script                         | Does                                                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm bootstrap`               | first-run setup: checks Node, pnpm and Docker; copies each `.env.example` to `.env` without overwriting; installs; starts Supabase; fills blank local values; applies migrations   |
| `pnpm bootstrap --no-supabase` | the same without Docker or Supabase; bring your own Postgres and set `DATABASE_URL` / `DIRECT_URL`                                                                                 |
| `pnpm dev`                     | runs the web app and the api in watch mode                                                                                                                                         |
| `pnpm build`                   | builds every package (runs `pnpm gen` first)                                                                                                                                       |
| `pnpm preflight`               | checks a deployment's configuration and exits 0 when it is safe to start                                                                                                           |
| `pnpm dev:guarded`             | `pnpm dev`, started only once preflight passes                                                                                                                                     |
| `pnpm dev:tools`               | lists the local consoles; `pnpm dev:tools <name>` opens one                                                                                                                        |
| `pnpm dev:tools:mail`          | opens Inbucket, the local mail catcher                                                                                                                                             |
| `pnpm dev:tools:supabase`      | opens Supabase Studio                                                                                                                                                              |
| `pnpm dev:tools:db`            | opens Prisma Studio                                                                                                                                                                |
| `pnpm dev:tools:all`           | opens all three                                                                                                                                                                    |
| `pnpm enable:dev-flags`        | turns on, for the local database only, the flags a developer normally wants (wiki, chat, public API, service accounts, query language, public forms). Refuses to run in production |

## Code generation

| Script                                         | Does                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm gen`                                     | runs `gen:schema`, `gen:events` and `gen:routers` in that order                                              |
| `pnpm gen:schema`                              | assembles `packages/db/prisma/schema.prisma` from `base.prisma` and each module's `prisma/*.prisma` fragment |
| `pnpm gen:events`                              | regenerates the `DomainEvent` union from each manifest module's `contracts/events.ts`                        |
| `pnpm gen:routers`                             | regenerates the api's tRPC app router from each manifest module's router                                     |
| `pnpm gen:module <name> --tier core\|extended` | scaffolds a new package and adds it to `modules.manifest.ts`                                                 |

## Database

| Script                                    | Does                                                    |
| ----------------------------------------- | ------------------------------------------------------- |
| `pnpm db:migrate`                         | applies committed migrations (`prisma migrate deploy`)  |
| `pnpm db:reset`                           | drops the local database and re-applies every migration |
| `pnpm --filter @monark/db db:migrate:dev` | creates a migration from schema changes and applies it  |
| `pnpm --filter @monark/db db:generate`    | regenerates the Prisma client (also runs on install)    |
| `pnpm --filter @monark/db db:studio`      | opens Prisma Studio                                     |
| `pnpm --filter @monark/db db:seed`        | runs the seed script                                    |

## Tests and coverage

| Script                           | Does                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm test`                      | unit and component tests in every workspace package                                           |
| `pnpm test:integration`          | integration tests against a throwaway Postgres container, one package at a time; needs Docker |
| `pnpm test:e2e`                  | Playwright end-to-end tests in `services/web`; needs the full stack running                   |
| `pnpm test:tools`                | tests for the repository scripts in `tools/`                                                  |
| `pnpm test:coverage`             | `pnpm test` with coverage written to each package's `coverage/unit/`                          |
| `pnpm test:integration:coverage` | `pnpm test:integration` with coverage written to `coverage/integration/`                      |
| `pnpm coverage:merge`            | merges unit and integration coverage per package and fails on any package below its floor     |
| `pnpm coverage:suggest`          | prints suggested floors derived from the last coverage run                                    |
| `pnpm webhook-receiver`          | starts a local webhook receiver on port 4123 (`--secret`, `--fail-once`, `--port`, `--quiet`) |

## Checks

| Script                  | Fails when                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm lint`             | ESLint reports a problem                                                                                |
| `pnpm typecheck`        | TypeScript reports an error                                                                             |
| `pnpm check:tiers`      | an extended module depends on another extended module or edits the core schema                          |
| `pnpm check:modules`    | a module is missing from the manifest, or lacks a README, `contracts/events.ts` or an integration suite |
| `pnpm check:i18n`       | a locale catalog's keys differ from `en.json`                                                           |
| `pnpm check:mcp`        | a public API route has no MCP decision, or a tool name is malformed or duplicated                       |
| `pnpm check:changelog`  | a `changelog.d/` fragment is misnamed or its date doesn't match its entry                               |
| `pnpm check:migrations` | the migrations don't reproduce `schema.prisma`; needs `SHADOW_DATABASE_URL`                             |
| `pnpm format:check`     | a file isn't Prettier-formatted (`pnpm format` fixes it)                                                |

## Operations

| Script                        | Does                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `pnpm sysadmin grant <email>` | grants the system administrator role; also `revoke <email>` and `list`         |
| `pnpm provision:org`          | creates the single organization from the `INITIAL_ORG_*` variables; idempotent |
| `pnpm changelog:compile`      | rebuilds `CHANGELOG.md` from `changelog.d/` (CI runs it on `develop`)          |
| `pnpm agent <command>`        | the contributor toolkit: worktrees, port slots, the pre-PR gate, opening PRs   |

## Per-package

| Script                                     | Does                                                     |
| ------------------------------------------ | -------------------------------------------------------- |
| `pnpm --filter <package> test:integration` | one package's integration suite                          |
| `pnpm --filter web screenshots`            | renders components in isolation for visual checks        |
| `pnpm --filter @monark/mcp build`          | bundles the MCP server into `services/mcp/dist/index.js` |

## Related

- [Set up a development environment](../get-started/set-up-a-development-environment.md)
- [Test layers](test-layers.md)
