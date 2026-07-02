import { mergeConfig, defineConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

// Integration test config — opt-in via `pnpm --filter @monark/rbac
// test:integration`. Boots a Postgres testcontainer in
// `globalSetup`, runs the workspace's Prisma migrations, then runs
// every spec under `tests/integration/`. Each spec uses Prisma
// directly + `truncate(...)` from `@monark/test-utils/db` between
// cases for isolation.
//
// Kept on its own config (and not wired into the default `test`
// script) because Docker isn't a hard requirement for the unit
// suite ; CI runs both via the e2e job's container-aware lane.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      globalSetup: ["@monark/test-utils/global-setup"],
      setupFiles: ["@monark/test-utils/assert-test-db"],
      include: ["tests/integration/**/*.test.ts"],
      // Long boot + migrate ; bump the per-test timeout so the
      // first test that pulls a fresh Prisma client doesn't fail
      // on a slow Docker daemon.
      testTimeout: 30_000,
      hookTimeout: 60_000,
      // Force serial execution within a file ; integration tests
      // share one DB and rely on `truncate` between cases.
      sequence: { concurrent: false },
      // Files share the testcontainer Postgres ; vitest's default
      // worker parallelism would race a future sibling spec's
      // TRUNCATE against this file's spec body. Force one-file-at-
      // a-time so the seed-test-teardown cycle is deterministic
      // across files even as the suite grows.
      fileParallelism: false,
      coverage: {
        // Integration run lands its coverage in `coverage/integration/`
        // so `tools/merge-coverage.ts` can fuse with the unit run's
        // `coverage/unit/`. The merged result lives at
        // `coverage/coverage-final.json` + `coverage/lcov.info` and is
        // what Codecov + (future) per-package thresholds read.
        reportsDirectory: "coverage/integration",
        include: ["src/**/*.ts"],
      },
    },
  }),
);
