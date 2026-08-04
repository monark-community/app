import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        reportsDirectory: "coverage/unit",
        include: ["src/**/*.ts"],
      },
    },
  }),
);
