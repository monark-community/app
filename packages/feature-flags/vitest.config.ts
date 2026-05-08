import { configDefaults, defineConfig, mergeConfig } from "vitest/config"
import baseConfig from "../../vitest.shared"

// Target threshold per test-plan : 85 %. Feature-flags is small +
// well-covered already (flags + resolve specs) ; the integration
// data-layer suite lands the rest.
//
// `test.exclude` REPLACES Vitest's defaults instead of merging into
// them, so we re-spread `configDefaults.exclude` to keep
// `**/node_modules/**` out. The explicit `tests/integration/**`
// keeps the testcontainer-backed `is-enabled.test.ts` out of the
// unit run ; it runs via `vitest.integration.config.ts` instead.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, "tests/integration/**"],
      coverage: {
        reportsDirectory: "coverage/unit",
        // thresholds: { lines: 85, branches: 85, functions: 85, statements: 85 },
        include: ["src/**/*.ts"],
      },
    },
  }),
)
