import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

// Unit run : excludes the testcontainer-backed `tests/integration/**` suite
// (that runs via vitest.integration.config.ts). Re-spread the defaults since
// `test.exclude` replaces rather than merges them.
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
