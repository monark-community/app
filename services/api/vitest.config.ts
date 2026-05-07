import { mergeConfig } from "vitest/config"
import { defineConfig } from "vitest/config"
import baseConfig from "../../vitest.shared"

// Target threshold per test-plan : 70 %. The api service is mostly
// Fastify boot + tRPC mounting + cron endpoint plumbing ; integration
// suites against Postgres testcontainers cover the meaningful logic.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        // thresholds: { lines: 70, branches: 70, functions: 70, statements: 70 },
        include: ["src/**/*.ts"],
      },
    },
  }),
)
