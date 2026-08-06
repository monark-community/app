import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

// Unit-only : Discord is a write-only integration (action nodes, no inbound
// webhook / router), so there's no testcontainer-backed integration suite.
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
