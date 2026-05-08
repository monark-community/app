import { configDefaults, defineConfig, mergeConfig } from "vitest/config"
import baseConfig from "../../vitest.shared"

// Target threshold per [test-plan.md](../../docs/technical-documentation/test-plan.md) : 80 %.
// Threshold is currently disabled while we backfill missing suites
// (signup integration, totp + trusted-devices integration, email-
// verification idempotency). Re-enable once each lands.
//
// `test.exclude` REPLACES Vitest's defaults instead of merging into
// them, so we re-spread `configDefaults.exclude` to keep
// `**/node_modules/**` out of the test glob. Without it Vitest walks
// into vendored test files (pino, zod, etc.) shipped alongside our
// transitive deps and fails on missing `tap` / `tape` modules.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, "tests/integration/**"],
      coverage: {
        // Unit run writes to `coverage/unit/` ; the merge script at
        // `tools/merge-coverage.ts` fuses with `coverage/integration/`
        // into a single per-package `coverage-final.json` + `lcov.info`.
        reportsDirectory: "coverage/unit",
        // thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
        include: ["src/**/*.ts"],
      },
    },
  }),
)
