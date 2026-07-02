import { mergeConfig, defineConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

// Integration test config — opt-in via `pnpm --filter @monark/auth
// test:integration`. Boots a Postgres testcontainer in
// `globalSetup`, runs the workspace's Prisma migrations, then runs
// every spec under `tests/integration/`. Each spec uses Prisma
// directly + truncates between cases for isolation. The supabase
// admin client is mocked at the module-import boundary because we
// only want to exercise the data layer, not Supabase Auth round-
// trips. TOTP_ENCRYPTION_KEY is set per-spec so the AES-256-GCM
// encrypt / decrypt round-trip the totp module relies on works.
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
      // All three specs share the User table ; `account-lifecycle`
      // runs `TRUNCATE User CASCADE` between cases, which tears out
      // the rows `totp` + `trusted-devices` seed in their
      // `beforeAll`. Default vitest runs files in parallel workers,
      // which races the truncate against the other files' spec
      // bodies ; surfaces as `Foreign key constraint violated` /
      // Postgres deadlocks. Forcing one-file-at-a-time execution
      // makes the seed-test-teardown cycle deterministic across
      // files. `sequence.concurrent: false` already covers
      // within-file serial.
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
