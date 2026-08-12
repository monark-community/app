import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

// `test.exclude` REPLACES Vitest's defaults, so re-spread `configDefaults.exclude`
// to keep node_modules out. `tests/integration/**` runs via the integration config.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, "tests/integration/**"],
      coverage: { reportsDirectory: "coverage/unit", include: ["src/**/*.ts"] },
    },
  }),
);
