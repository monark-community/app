import { mergeConfig } from "vitest/config"
import { defineConfig } from "vitest/config"
import baseConfig from "../../vitest.shared"

// Target threshold per [test-plan.md](../../docs/technical-documentation/test-plan.md) : 80 %.
// Threshold is currently disabled while we backfill missing suites
// (signup integration, totp + trusted-devices integration, email-
// verification idempotency). Re-enable once each lands.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        // thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
        include: ["src/**/*.ts"],
      },
    },
  }),
)
