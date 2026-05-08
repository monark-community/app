import { defineConfig, devices } from "@playwright/test"

// Smoke-only Playwright config; the suite verifies routing + auth gates
// without depending on a running Supabase / Mailpit stack. Full happy-path
// flows (signup -> verify -> TOTP) land in a follow-up that wires Mailpit's
// HTTP API for inbox polling.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Wait on BOTH the web server (3000) and the api (4000/health) before
  // launching tests. An earlier version only waited on 3000 ; turbo
  // runs `dev` for both packages in parallel, so web can come up
  // while the api is still booting. The seeded sign-in flow calls
  // the api via tRPC (trusted-device recognize, totp challenge check,
  // etc.) and intermittently bounces back to /signin when the api
  // isn't ready in time. Two webServer entries make Playwright block
  // until both respond. The second entry sets
  // `reuseExistingServer: true` because the first entry already
  // started `pnpm dev` ; we just want it to wait for the api's
  // /health endpoint.
  webServer: process.env.CI
    ? [
        {
          command: "pnpm dev",
          url: "http://localhost:3000",
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command: "pnpm dev",
          url: "http://localhost:4000/health",
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ]
    : undefined,
})
