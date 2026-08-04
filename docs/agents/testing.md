# Testing guidelines

How to write and run tests in this monorepo, for agents and humans. Read this before you add a test or a package. The commands are in the [development guide](../technical-documentation/development.md#test) ; the _strategy_ (layer responsibilities, what to write) is in [test-plan.md](../technical-documentation/test-plan.md). This page is the practical "how the harness works + how to add a test."

## TL;DR

- **Three layers.** _Unit_ (Vitest, no DB) → `tests/*.test.ts`. _Integration_ (real Postgres via a testcontainer) → `tests/integration/**/*.test.ts` + a `vitest.integration.config.ts`. _e2e_ (Playwright, full stack) → `services/web`.
- **Integration + e2e need Docker running.** Each integration run boots a throwaway `postgres:16-alpine` container ; the `assert-test-db` guard aborts if you point them at a real DB.
- **Coverage floors are per-package**, defined in `tools/merge-coverage.ts` — _not_ a single flat 75 %. A package that emits coverage with **no `THRESHOLDS` entry fails the gate**, so a new package must add one.
- **Every module needs an integration suite** — `pnpm check:modules` enforces it (conscious exceptions are listed in `tools/check-modules.ts`).
- Run: `pnpm test` (unit), `pnpm test:integration` (serialized), `pnpm --filter <pkg> test:integration` (one package), `pnpm test:e2e` (Playwright).

## The layers

### Unit — `tests/*.test.ts`

Plain Vitest, no database, no network. Pure functions, validation, mappers, reducers, small pieces of server logic with their dependencies stubbed. Fast ; runs in `pnpm test`. Per-package script is `vitest run --passWithNoTests`.

### Integration — `tests/integration/**/*.test.ts`

Exercises real Prisma against a **throwaway Postgres testcontainer**. Owned by `@monark/test-utils` :

- A per-package `vitest.integration.config.ts` sets `globalSetup: ["@monark/test-utils/global-setup"]` (boots `postgres:16-alpine`, runs `pnpm db:migrate` against it, points `DATABASE_URL`/`DIRECT_URL` at it), `setupFiles: ["@monark/test-utils/assert-test-db"]`, `include: ["tests/integration/**/*.test.ts"]`, and runs **serialized** (`sequence.concurrent: false`, `fileParallelism: false`).
- The **`assert-test-db` guard** aborts the run unless `DATABASE_URL` contains the `/monark_test` marker (the testcontainer's DB name). This is the safety net against an IDE runner that skips the integration config and would otherwise write to your dev / Supabase DB.
- Reset state between tests with `truncate(getDb(), ["Table", …])` in `beforeEach` (from `@monark/test-utils/db`) — a full container rebuild per test is too slow.

Docker must be running. Turbo passes `DOCKER_HOST` + `TESTCONTAINERS_*` through for the integration tasks. Run all with `pnpm test:integration` (Turbo, `--concurrency=1`) or one package with `pnpm --filter <pkg> test:integration`.

### e2e — Playwright (`services/web`)

Drives the running app (Supabase + api + web) with Playwright. `pnpm test:e2e` → `playwright test`. Notes :

- Browser is **Chromium only** (`playwright install --with-deps chromium`).
- Full-stack specs opt in with **`E2E_FULL_STACK=1`** ; without it they're skipped so a smoke run stays light.
- Seed the test users first : `pnpm tsx tools/seed-e2e-users.ts`. Relevant env : `E2E_USER_EMAIL`/`_PASSWORD`, `E2E_ADMIN_EMAIL`/`_PASSWORD`, `INBUCKET_URL=http://localhost:54324`, `API_URL=http://localhost:4000`.
- CI runs e2e only on a manual `workflow_dispatch`, not on every push.

## Coverage

Each package runs Vitest twice — unit → `coverage/unit/`, integration → `coverage/integration/` — and `pnpm coverage:merge` (`tools/merge-coverage.ts`) fuses them into one report per package and **enforces per-package floors** :

- Floors are per-package **and** per-metric (lines / statements / functions / branches), each set a few points below the measured baseline (see `THRESHOLDS` in `tools/merge-coverage.ts`).
- There is **no flat repo-wide 75 %**. Different packages have very different realistic floors (a pure library sits high ; `services/web` is mostly untested UI and sits low on lines but higher on branches).
- **A package that produces coverage but has no `THRESHOLDS` entry fails the merge.** When you add a package, add its entry (start ~5 points under its first measured run).

Run the whole thing : `pnpm test:coverage && pnpm test:integration:coverage && pnpm coverage:merge`.

## Adding a test

- **Unit** — drop `tests/<thing>.test.ts` in the package. Nothing else needed ; it's picked up by `pnpm test`.
- **Integration** — add `tests/integration/<thing>.test.ts`. If the package has no integration config yet, copy an existing `vitest.integration.config.ts` (e.g. `packages/calendar/`), keep the `globalSetup` + `setupFiles` + `include` lines, and add the `test:integration` script (`vitest run --config vitest.integration.config.ts --passWithNoTests`). Reset touched tables in `beforeEach` with `truncate`.
- **New module** — it needs at least one integration suite (`check:modules` requires it). See [module-authoring.md](module-authoring.md).
- **New package** — add a `THRESHOLDS` entry in `tools/merge-coverage.ts` or the coverage merge fails.

## Don'ts

- Don't run an integration spec directly from an IDE without the integration config — the `assert-test-db` guard will (correctly) abort, because `globalSetup` never booted the container and the spec would hit your dev DB.
- Don't write DB-touching assertions in a _unit_ test — that's integration work ; keep the layers separate (slow-in-unit / flaky-in-e2e is the anti-pattern this split avoids).
- Don't lower a coverage floor to make a red build green — add the missing test, or justify the floor change explicitly.
