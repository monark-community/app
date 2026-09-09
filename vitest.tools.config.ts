import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.shared";

/**
 * Suites for the repo-level scripts in `tools/`.
 *
 * `pnpm test` is `turbo run test`, which fans out to the per-package `test`
 * tasks ; `tools/` is not a workspace package, so it has no task to be fanned
 * out to and its suites would otherwise never run. This config gives them a
 * home without turning `tools/` into a package: `pnpm test:tools`, wired into
 * CI's repo-checks job next to the `check:*` guards these tests cover.
 *
 * Deliberately not folded into the root `test` script — that would recurse
 * into turbo. Keep them separate.
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["tools/tests/**/*.test.ts"],
      passWithNoTests: false,
    },
  }),
);
