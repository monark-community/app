import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../vitest.shared";

// `tools/` is a workspace package so its scripts are covered by the same
// gate as everything else — several of them (`check-tiers`, `check-modules`,
// `check-i18n`, `check-mcp`, `check-migrations`) ARE the CI gates, and an
// untested gate fails silently: it stops enforcing rather than going red.
//
// No coverage floor is configured. `tools/merge-coverage.ts` only walks
// `packages/` and `services/`, so this package is outside the merged report
// by construction ; a floor here would never be evaluated.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        include: ["**/*.ts"],
        exclude: ["**/*.test.ts", "vitest.config.ts"],
      },
    },
  }),
);
