import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

// Unit run : everything except the testcontainer-backed `tests/integration/**`
// (which runs via `vitest.integration.config.ts`). Re-spread the Vitest default
// excludes since `test.exclude` replaces rather than merges them.
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
