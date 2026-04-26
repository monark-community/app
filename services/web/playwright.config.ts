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
  webServer: process.env.CI
    ? {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
})
