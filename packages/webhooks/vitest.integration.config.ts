import { mergeConfig, defineConfig } from "vitest/config"
import baseConfig from "../../vitest.shared"

// Same shape as the other packages' integration configs ; runs every
// spec under `tests/integration/` against a fresh Postgres
// testcontainer booted in `globalSetup`. Opt-in via `pnpm --filter
// @monark/webhooks test:integration`.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      globalSetup: ["@monark/test-utils/global-setup"],
      include: ["tests/integration/**/*.test.ts"],
      testTimeout: 30_000,
      hookTimeout: 60_000,
      sequence: { concurrent: false },
      // Files share the testcontainer ; default vitest worker
      // parallelism races their TRUNCATEs against other files'
      // spec bodies. Force one-file-at-a-time.
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
)
