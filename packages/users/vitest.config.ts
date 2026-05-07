import { mergeConfig } from "vitest/config"
import { defineConfig } from "vitest/config"
import baseConfig from "../../vitest.shared"

// Target threshold per test-plan : 80 %. Currently placeholder ;
// data + profile + deletion integration suites need to land before
// we can flip the threshold on.
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
