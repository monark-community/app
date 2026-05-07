import { defineConfig } from "vitest/config"

/**
 * Shared vitest base config. Per-package `vitest.config.ts` files
 * extend this with `mergeConfig` and override what they need :
 *
 *   import { mergeConfig } from "vitest/config"
 *   import baseConfig from "../../vitest.shared"
 *
 *   export default mergeConfig(baseConfig, defineConfig({
 *     test: {
 *       coverage: {
 *         thresholds: { lines: 75, branches: 75, functions: 75, statements: 75 },
 *       },
 *     },
 *   }))
 *
 * Why a shared base + per-package overrides instead of one root config :
 * each workspace package owns its own coverage threshold (the plan
 * sets 50 % for `@monark/db`, 70 % for `services/api`, 75 % for the
 * default, 80 % for the security-sensitive web actions). Centralising
 * the provider + reporter + exclude list keeps that consistent ; the
 * threshold lives next to the package so the floor is obvious when
 * editing it.
 *
 * Everything below the package threshold goes in [test-plan.md](docs/technical-documentation/test-plan.md).
 */
export default defineConfig({
  test: {
    // `passWithNoTests: true` lets bare workspace packages run the
    // task without a hard error before they have suites ; per-package
    // configs flip this off once they cross the 75 % bar so a removed
    // suite can't silently disable the gate.
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      // Files that exist purely as re-exports / type declarations /
      // generated code never carry meaningful behaviour ; excluding
      // them keeps the coverage number honest.
      exclude: [
        "**/index.ts",
        "**/*.d.ts",
        "**/contracts/**",
        "**/types.ts",
        "**/*.config.{ts,js,mjs,cjs}",
        "**/dist/**",
        "**/.turbo/**",
        "**/.next/**",
        "**/coverage/**",
        "**/tests/**",
        "**/test-utils/**",
        // Generated Prisma client + tRPC router glue.
        "**/data/generated/**",
        "**/server/generated/**",
      ],
    },
  },
})
