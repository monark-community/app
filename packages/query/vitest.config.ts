import { defineConfig } from "vitest/config";

// @monark/query keeps ALL its behaviour under `src/contracts` (the AST +
// operator taxonomy, the text DSL, `@variables`, and the autocomplete engine),
// so — unlike every other package — it must NOT inherit the shared config's
// `**/contracts/**` coverage exclude, or the whole package reads 0 %. Hence a
// standalone config with a contracts-aware include/exclude (the provider +
// reporters still match the shared base so the merge gate ingests it).
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html", "json"],
      reportsDirectory: "coverage/unit",
      include: ["src/**/*.ts"],
      exclude: ["**/index.ts", "**/*.d.ts", "**/tests/**", "**/*.config.{ts,js,mjs,cjs}"],
    },
  },
});
