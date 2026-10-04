---
type: reference
---

# CI jobs

The GitHub Actions workflows in this repo, what each job runs, and when.

<!-- source: .github/workflows/*.yml -->

## Verify pipeline (`ci.yml`)

Runs on every push to `main` or `develop` and every pull request targeting them. A newer commit on the same ref cancels the run in progress. Every job installs with `pnpm install --frozen-lockfile` on the Node version in `.nvmrc`.

| Job                 | Runs                                                                                                                                                                                                       | Needs                             | Fails when                                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint-typecheck`    | `pnpm lint`, `pnpm typecheck`                                                                                                                                                                              | none                              | a lint or type error                                                                                                                                                                                     |
| `repo-checks`       | `pnpm gen:schema --check`, `pnpm gen:events --check`, `pnpm gen:routers --check`, `pnpm check:tiers`, `pnpm check:modules`, `pnpm check:i18n`, `pnpm check:mcp`, `pnpm check:changelog`, `pnpm test:tools` | none                              | a generated file is stale, a module boundary or completeness rule is broken, locale catalogs differ, a public-API route has no MCP decision, a changelog fragment is misnamed, or a repo-tool test fails |
| `migration-drift`   | `pnpm check:migrations` against a `postgres:16-alpine` service (`SHADOW_DATABASE_URL`)                                                                                                                     | none                              | replaying the committed migrations doesn't reproduce `schema.prisma`                                                                                                                                     |
| `unit-tests`        | `pnpm test:coverage`; uploads `coverage/unit/` as artifact `coverage-unit`                                                                                                                                 | none                              | a unit test fails                                                                                                                                                                                        |
| `integration-tests` | `pnpm test:integration:coverage`; uploads `coverage/integration/` as artifact `coverage-integration`                                                                                                       | none                              | an integration test fails (each package boots a Postgres testcontainer)                                                                                                                                  |
| `coverage-upload`   | `pnpm coverage:merge`, then uploads every merged `lcov.info` to Codecov                                                                                                                                    | `unit-tests`, `integration-tests` | a package is below its coverage floor, or emits coverage with no floor                                                                                                                                   |
| `ci-ok`             | checks that every job above reported `success`                                                                                                                                                             | all of the above                  | any job failed, was cancelled or was skipped                                                                                                                                                             |

`ci-ok` is the only status check branch protection requires on `develop` and `main`.

Codegen drift checks ignore line endings, so a CRLF file committed from Windows isn't drift.

## Coverage floors

| Item                                   | Value                                                            |
| -------------------------------------- | ---------------------------------------------------------------- |
| Where floors live                      | `THRESHOLDS` in `tools/merge-coverage.ts`, one entry per package |
| Metrics per package                    | `lines`, `statements`, `functions`, `branches`                   |
| Package with no `test:coverage` script | listed as skipped, not failed                                    |
| Package with coverage but no entry     | fails: "produced coverage but has no THRESHOLDS entry"           |
| Suggested floors                       | `pnpm coverage:suggest` prints floors from measured coverage     |

## Other workflows

| Workflow                | Trigger                                                               | What it does                                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy-api.yml`        | `CI` completes successfully on `main` or `develop`; manual            | Deploys `monark-api`, `monark-cron-deletions` and `monark-cron-webhook-sweep` (with `-staging` on `develop`) through the Render API and waits up to 20 minutes per service for a terminal state. No-ops without the `RENDER_API_KEY` secret. |
| `e2e.yml`               | manual only                                                           | Boots Supabase, the api and the web app, then runs the Playwright suite.                                                                                                                                                                     |
| `lighthouse.yml`        | manual only                                                           | Web performance and accessibility budget.                                                                                                                                                                                                    |
| `gitleaks.yml`          | push to `main` / `develop`; pull request to `main`                    | Secret scanning (allowlist in `.gitleaks.toml`).                                                                                                                                                                                             |
| `codeql.yml`            | push to `main` / `develop`; pull request to `main`; Mondays 03:27 UTC | Static analysis.                                                                                                                                                                                                                             |
| `dependency-review.yml` | pull request to `main`                                                | Flags risky dependency changes.                                                                                                                                                                                                              |
| `agent-attribution.yml` | pull request to `main` / `develop`                                    | Fails a pull request opened by `monark-agent` that contains a commit authored by someone else.                                                                                                                                               |
| `changelog-compile.yml` | push to `develop`                                                     | Rebuilds `CHANGELOG.md` from `changelog.d/` fragments.                                                                                                                                                                                       |
| `notify-docs.yml`       | push to `develop` touching published docs; manual                     | Asks `monark-community/app-docs` to sync. Skips with a notice without the `DOCS_SYNC_APP_*` secrets.                                                                                                                                         |
| `github-label-sync.yml` | manual only                                                           | Syncs the repository's issue labels.                                                                                                                                                                                                         |

Related: [Maintain the CI pipeline](../operate/ci.md), [Environment variables](environment-variables.md).
