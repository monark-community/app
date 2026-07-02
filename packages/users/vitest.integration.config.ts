import { mergeConfig, defineConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

// Same shape as `packages/rbac/vitest.integration.config.ts` ; runs
// every spec under `tests/integration/` against a fresh Postgres
// testcontainer booted in `globalSetup`. Opt-in via `pnpm --filter
// @monark/users test:integration`.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      globalSetup: ["@monark/test-utils/global-setup"],
      setupFiles: ["@monark/test-utils/assert-test-db"],
      include: ["tests/integration/**/*.test.ts"],
      testTimeout: 30_000,
      hookTimeout: 60_000,
      sequence: { concurrent: false },
      // Files share the testcontainer Postgres ; default vitest
      // worker parallelism races their TRUNCATEs against each
      // others' spec bodies. Force one-file-at-a-time so each
      // file's beforeAll seed survives.
      fileParallelism: false,
      coverage: {
        // Integration run writes to `coverage/integration/` ; merged
        // with the unit run's `coverage/unit/` by
        // `tools/merge-coverage.ts`.
        reportsDirectory: "coverage/integration",
        include: ["src/**/*.ts"],
      },
    },
  }),
);
