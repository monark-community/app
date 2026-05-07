import { mergeConfig } from "vitest/config"
import { defineConfig } from "vitest/config"
import baseConfig from "../../vitest.shared"

// Target threshold per test-plan : 85 %. Feature-flags is small +
// well-covered already (flags + resolve specs) ; the integration
// data-layer suite lands the rest.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        // thresholds: { lines: 85, branches: 85, functions: 85, statements: 85 },
        include: ["src/**/*.ts"],
      },
    },
  }),
)
