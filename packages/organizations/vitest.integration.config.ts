import { mergeConfig, defineConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

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
      // Spec files share the same Postgres testcontainer ; running
      // them in parallel workers races concurrent TRUNCATEs against
      // each others' spec bodies. Force serial across files so each
      // file's beforeAll seed survives until its afterAll teardown.
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
