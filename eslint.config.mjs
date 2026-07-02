// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/*.generated.ts",
    ],
  },

  ...tseslint.configs.recommended,

  {
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // services/web must not reach into any module's /server entry.
  {
    files: ["services/web/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@monark/*/server"],
              message:
                "services/web cannot import from @monark/*/server. Use @monark/*/client or @monark/*/contracts.",
            },
          ],
        },
      ],
    },
  },

  // services/api must not reach into any module's /client entry.
  {
    files: ["services/api/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@monark/*/client"],
              message:
                "services/api cannot import from @monark/*/client. Use @monark/*/server or @monark/*/contracts.",
            },
          ],
        },
      ],
    },
  },
);
