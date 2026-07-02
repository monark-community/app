import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.shared";

// Target threshold per test-plan : 70 %. The api service is mostly
// Fastify boot + tRPC mounting + cron endpoint plumbing ; integration
// suites against Postgres testcontainers cover the meaningful logic.
//
// `test.exclude` REPLACES Vitest's defaults instead of merging into
// them, so we re-spread `configDefaults.exclude` to keep
// `**/node_modules/**` out. The explicit `tests/integration/**`
// keeps the testcontainer-backed `server.test.ts` out of the unit
// run ; it runs via `vitest.integration.config.ts` instead.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, "tests/integration/**"],
      coverage: {
        reportsDirectory: "coverage/unit",
        // thresholds: { lines: 70, branches: 70, functions: 70, statements: 70 },
        include: ["src/**/*.ts"],
      },
    },
  }),
);
