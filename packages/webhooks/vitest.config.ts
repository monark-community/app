import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

// `test.exclude` REPLACES Vitest's defaults instead of merging into
// them, so we re-spread `configDefaults.exclude` to keep
// `**/node_modules/**` out. The explicit `tests/integration/**`
// keeps the testcontainer-backed specs out of the unit run ; they
// run via `vitest.integration.config.ts` instead.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, "tests/integration/**"],
      coverage: {
        reportsDirectory: "coverage/unit",
        include: ["src/**/*.ts"],
      },
    },
  }),
);
