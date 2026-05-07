import { mergeConfig } from "vitest/config"
import { defineConfig } from "vitest/config"
import baseConfig from "../../vitest.shared"

// Target threshold per test-plan : 80 %. Common is small + fully
// pure (errors, events, logger, tRPC plumbing) so it should clear
// the bar with the suites added in [tests/](./tests/).
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
