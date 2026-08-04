# @monark/test-utils

Shared harness for the integration test suites : it boots a throwaway Postgres [testcontainer](https://testcontainers.com/), applies the workspace's Prisma migrations, points `DATABASE_URL` at it, and gives each spec a clean slate. Backend/test-only ; nothing here ships in a runtime bundle.

## What lives here

- **Container lifecycle** ([`src/db.ts`](src/db.ts)); `startTestDb()` boots a fresh `postgres:16-alpine` container (database `monark_test`, `fsync=off` for speed), rewrites `DATABASE_URL` + `DIRECT_URL` to point at it, and runs `pnpm db:migrate` (prod-style `migrate deploy`) so the schema matches `schema.prisma` exactly. `stopTestDb(db)` tears the container down. `truncate(prisma, tables)` clears the given tables with `TRUNCATE … RESTART IDENTITY CASCADE` (dependency order handled by `CASCADE`) for a `beforeEach` reset without a full rebuild. The `@testcontainers/postgresql` import is lazy so `pnpm typecheck` stays green on a fresh clone before `pnpm install`.
- **Vitest global setup** ([`src/global-setup.ts`](src/global-setup.ts)); the default-export `globalSetup` entrypoint. Runs once per test process before any test file imports anything : calls `startTestDb()` and returns a teardown closure that calls `stopTestDb()` on suite end.
- **Test-DB guard** ([`src/assert-test-db.ts`](src/assert-test-db.ts)); a `setupFiles` module that aborts the run (loudly) unless `DATABASE_URL` points at the testcontainer, detected by the `/monark_test` path marker. It's the safety net against an IDE runner that skips `vitest.integration.config.ts` (no `globalSetup`, no container) and would otherwise silently write to the dev / Supabase DB.

## Public entry points

The package has no barrel ; import the subpath you need.

| Import path                         | What it exports                                                        |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `@monark/test-utils/db`             | `startTestDb`, `stopTestDb`, `truncate`, `StartedDb` (type)            |
| `@monark/test-utils/global-setup`   | default `globalSetup` function (boots the container, returns teardown) |
| `@monark/test-utils/assert-test-db` | side-effecting guard ; import it as a `setupFiles` entry               |

## Usage

Wire it from a per-package `vitest.integration.config.ts` :

```ts
import { defineConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    globalSetup: ["@monark/test-utils/global-setup"],
    setupFiles: ["@monark/test-utils/assert-test-db"],
    include: ["tests/integration/**/*.test.ts"],
  },
});
```

Then in a spec, reset touched tables between tests :

```ts
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";

beforeEach(async () => {
  await truncate(getDb(), ["Organization", "User"]);
});
```

Run the suite via `pnpm test:integration` (or `pnpm --filter <pkg> test:integration`) so `globalSetup` boots the container ; running a spec directly is what the `assert-test-db` guard rejects.

## Why a fresh container per run

- Tests start from a known clean state — no cross-run cleanup.
- Concurrent runs (multiple devs, a CI matrix) don't trample each other.
- `migrate deploy` guarantees the schema matches `schema.prisma`, even when the dev DB lags after a pull.

Cost is ~5 s container boot + ~2 s migrations on a warm Docker daemon, paid once per test process (amortised across the whole suite by `globalSetup`).

## Dependencies

- `@monark/db` (Prisma schema + `db:migrate` script the container runs)
- `testcontainers` + `@testcontainers/postgresql` (ephemeral Postgres ; requires a running Docker daemon)

## Operational

Requires Docker (or a `DOCKER_HOST` / `TESTCONTAINERS_*` environment, which `turbo.json` passes through for the integration tasks). No other setup ; the container's connection string is injected into the environment at boot.
