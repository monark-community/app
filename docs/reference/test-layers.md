---
type: reference
---

# Test layers

The four kinds of test in the repository: where each lives, what it runs against, and the command that runs it.

<!-- source: packages/test-utils, packages/*/vitest.integration.config.ts, services/web/playwright.config.ts, tools/merge-coverage.ts -->

## Layers

| Layer       | Answers                                                            | Lives in                                   | Runs against                                     | Command                 |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------ | ----------------------- |
| Unit        | does this function do the right thing in isolation?                | `<package>/tests/*.test.ts`                | nothing: no database, no network                 | `pnpm test`             |
| Integration | do the module's queries, procedures and subscribers work together? | `<package>/tests/integration/**/*.test.ts` | a fresh `postgres:16-alpine` container per run   | `pnpm test:integration` |
| Component   | does this React component render and behave with known data?       | `services/web/tests/components/*.test.tsx` | jsdom, the real `en` catalog, stubbed tRPC calls | `pnpm test`             |
| End-to-end  | can a person complete this flow in a browser?                      | `services/web/tests/e2e/*.spec.ts`         | the running app: Supabase, api and web           | `pnpm test:e2e`         |

Other suites: `pnpm test:tools` runs the tests for the repository scripts in `tools/`; `services/api/tests/integration/mcp-e2e.test.ts` drives the MCP server against a real API.

## Tooling

| Layer       | Tools                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------- |
| Unit        | Vitest                                                                                      |
| Integration | Vitest, Testcontainers; `@monark/test-utils` (`global-setup`, `assert-test-db`, `truncate`) |
| Component   | Vitest, Testing Library, msw; `renderWithIntl` from `services/web/tests/test-utils.tsx`     |
| End-to-end  | Playwright (Chromium only), `@axe-core/playwright` for the accessibility sweep              |

## Integration harness

| Setting             | Value                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Config file         | `vitest.integration.config.ts` in the package                                                                   |
| `globalSetup`       | `@monark/test-utils/global-setup`: starts the container, applies migrations, sets `DATABASE_URL` / `DIRECT_URL` |
| `setupFiles`        | `@monark/test-utils/assert-test-db`: aborts unless `DATABASE_URL` contains `/monark_test`                       |
| Concurrency         | serial (`fileParallelism: false`); turbo runs packages with `--concurrency=1`                                   |
| Reset between tests | `truncate(getDb(), ["Table", …])` in `beforeEach`                                                               |
| Requires            | Docker running                                                                                                  |

## End-to-end settings

| Variable                                | Purpose                                                |
| --------------------------------------- | ------------------------------------------------------ |
| `E2E_FULL_STACK=1`                      | runs the full-stack specs; without it they are skipped |
| `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`   | the member test account                                |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | the admin test account                                 |
| `INBUCKET_URL`                          | the local mail catcher, `http://localhost:54324`       |
| `API_URL`                               | the api, `http://localhost:4000`                       |

Seed the test accounts with `pnpm tsx tools/seed-e2e-users.ts`.

## Coverage

| Item               | Value                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Unit output        | `<package>/coverage/unit/`                                                                                        |
| Integration output | `<package>/coverage/integration/`                                                                                 |
| Merge and gate     | `pnpm coverage:merge` fuses both per package and checks the floors                                                |
| Floors             | per package and per metric (lines, statements, functions, branches), in `THRESHOLDS` in `tools/merge-coverage.ts` |
| Missing floor      | a package that produces coverage without a `THRESHOLDS` entry fails the merge                                     |

## In CI

| Job                 | Runs                                          |
| ------------------- | --------------------------------------------- |
| `unit-tests`        | `pnpm test:coverage`                          |
| `integration-tests` | `pnpm test:integration:coverage`              |
| `coverage-upload`   | `pnpm coverage:merge`                         |
| `repo-checks`       | `pnpm test:tools` among the repository checks |
| `e2e.yml`           | Playwright, on manual dispatch only           |

## Related

- [Write tests](../build/extend/write-tests.md)
- [Scripts](scripts.md)
