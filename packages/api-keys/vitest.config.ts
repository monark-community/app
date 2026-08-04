import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

// Keeps the testcontainer-backed suite under `tests/integration/**` out of the
// unit run ; it runs via `vitest.integration.config.ts` instead.
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
