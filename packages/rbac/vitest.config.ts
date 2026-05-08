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
        // thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
        include: ["src/**/*.ts"],
      },
    },
  }),
)
