import { mergeConfig } from "vitest/config"
import { defineConfig } from "vitest/config"
import baseConfig from "../../vitest.shared"

// Target threshold per test-plan : 80 %. Currently placeholder ;
// data + bootstrap + slug-rotation + invites suites need to land.
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
