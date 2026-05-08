import { mergeConfig, defineConfig } from "vitest/config"
import baseConfig from "../../vitest.shared"

// Same shape as the package-level integration configs ; runs every
// spec under `tests/integration/` against a fresh Postgres
// testcontainer booted in `globalSetup`. The api integration
// suite imports `app` from `src/server.ts` and drives requests via
// supertest ; the entrypoint guard inside server.ts means importing
// the module does NOT call `app.listen()` or start the webhook
// worker.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      globalSetup: ["@monark/test-utils/global-setup"],
      include: ["tests/integration/**/*.test.ts"],
      testTimeout: 30_000,
      hookTimeout: 60_000,
      sequence: { concurrent: false },
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
