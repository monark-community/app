import { configDefaults, defineConfig, mergeConfig } from "vitest/config"
import baseConfig from "../../vitest.shared"

// Target threshold per test-plan : 80 %. Permission registry +
// guards covered ; data + read + write integration suites land the
// rest (testcontainer Postgres).
//
// `test.exclude` REPLACES Vitest's defaults instead of merging into
// them, so we re-spread `configDefaults.exclude` explicitly. Without
// the spread, the integration-suite exclusion silently drops
// `**/node_modules/**` and Vitest happily walks into vendored test
// files (pino, pino-pretty, zod's nested v4 tests) looking for
// suites to run, which surface as a wall of "Cannot find module
// 'tap'/'tape'/etc" failures on CI.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, "tests/integration/**"],
      coverage: {
        // Unit run writes to `coverage/unit/` ; the integration
        // config writes to `coverage/integration/`. The merge
        // script at `tools/merge-coverage.ts` fuses both into
        // `coverage/coverage-final.json` + `coverage/lcov.info`
        // so Codecov + the per-package threshold gate (in a follow-
        // up commit) read the union of unit + integration coverage.
        reportsDirectory: "coverage/unit",
        include: ["src/**/*.ts"],
        // Test-plan target : 80 % across all four metrics. Flipped
        // on once the merge script's first CI run produces the
        // baseline numbers ; the script's threshold check is the
        // canonical gate, not vitest's.
        // thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
      },
    },
  }),
)
