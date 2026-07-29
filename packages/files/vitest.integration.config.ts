import { mergeConfig, defineConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

// Runs every spec under `tests/integration/` against a fresh Postgres
// testcontainer booted in `globalSetup`. Opt-in via
// `pnpm --filter @monark/files test:integration`.
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
      fileParallelism: false,
      coverage: {
        reportsDirectory: "coverage/integration",
        include: ["src/**/*.ts"],
      },
    },
  }),
);
