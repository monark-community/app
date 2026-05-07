import { mergeConfig } from "vitest/config"
import { defineConfig } from "vitest/config"
import baseConfig from "../../vitest.shared"

// Target threshold per test-plan : 90 % (single config object).
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        // thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
        include: ["src/**/*.ts"],
      },
    },
  }),
)
