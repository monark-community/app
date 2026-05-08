import { mergeConfig } from "vitest/config"
import { defineConfig } from "vitest/config"
import baseConfig from "../../vitest.shared"

// Target threshold per test-plan : 80 %. Permission registry +
// guards covered ; data + read + write integration suites land the
// rest (testcontainer Postgres).
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: ["tests/integration/**"],
      coverage: {
        // thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
        include: ["src/**/*.ts"],
      },
    },
  }),
)
