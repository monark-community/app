import { mergeConfig, defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"
import baseConfig from "../../vitest.shared"

// Component test config for the Next.js app. Uses the shared root
// vitest config (provider + reporters + excludes) and layers on :
//
//   - jsdom environment so React components have a `window` / `document`
//     to mount into.
//   - the React + JSX-runtime plugin so .tsx files compile.
//   - a `setupFiles` entry that wires `@testing-library/jest-dom`
//     matchers + the per-test cleanup.
//   - the same `@/` path alias the app uses so test imports look
//     identical to source imports.
//
// Per the test plan : 75 % overall coverage threshold ; 80 % on
// `src/app/(authed)/**/actions.ts` files (security-sensitive). The
// thresholds stay commented-off for now while the suites are being
// stood up. Flip on per file as gaps close.
export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
        // `server-only` is a Next.js build-time guard ; stub it as
        // empty so action tests that transitively import server
        // modules don't crash in vitest's jsdom environment.
        "server-only": resolve(__dirname, "./tests/__mocks__/server-only.ts"),
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./tests/setup.ts"],
      include: [
        "tests/components/**/*.test.{ts,tsx}",
        "tests/actions/**/*.test.ts",
      ],
      exclude: [
        "**/node_modules/**",
        "**/.next/**",
        "tests/e2e/**",
      ],
      coverage: {
        // The web service has no integration suite ; the unit run
        // already produces the canonical report. Subdir kept
        // consistent with the rest of the workspace so the merge
        // script's discovery walks one shape.
        reportsDirectory: "coverage/unit",
        // thresholds: { lines: 75, branches: 75, functions: 75, statements: 75 },
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.d.ts",
          "src/messages/**",
          "src/app/**/page.tsx", // pure composition, e2e covers the routes
          "src/app/**/layout.tsx",
          "src/app/**/loading.tsx",
          "src/i18n/**",
          "src/lib/trpc.ts", // generated client glue
          "src/lib/trpc-server.ts",
        ],
      },
    },
  }),
)
