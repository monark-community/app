import { mergeConfig, defineConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

// Integration test config — opt-in via `pnpm --filter
// @monark/notifications test:integration`. Boots a Postgres
// testcontainer in `globalSetup`, runs the workspace's Prisma
// migrations, then runs every spec under `tests/integration/`. The
// SMTP transport is forced into log-only mode (no `SMTP_URL` set) so
// the dispatch path exercises the full DB write + delivery loop
// without us booting a smtp-tester next to Postgres ; the unit suite
// already covers nodemailer interaction.
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
      // Single spec today, but if more land they'll share the same
      // testcontainer Postgres ; force serial across files so a
      // future spec's TRUNCATE doesn't race a sibling's spec body.
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
