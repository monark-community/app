import { expect, test } from "@playwright/test"

/**
 * Sign-in happy-path e2e. Drives the browser through the regular
 * sign-in flow with a pre-seeded user (no TOTP) and verifies the
 * landing page + the user-menu drawer + the sign-out path.
 *
 * Skipped by default ; opt in with `E2E_FULL_STACK=1`. Requires the
 * Supabase local stack running + a pre-seeded user account whose
 * credentials are exposed via env :
 *   - `E2E_USER_EMAIL` (default `e2e-user@monark.test`)
 *   - `E2E_USER_PASSWORD`
 *
 * The TOTP-enrolled flow lives in [signin-totp.spec.ts](./signin-totp.spec.ts)
 * — kept separate so the setup (a user with TOTP secret) doesn't
 * complicate this happy path.
 */

const isFullStack = process.env.E2E_FULL_STACK === "1"
const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? "e2e-user@monark.test"
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD

test.describe("sign-in happy path", () => {
  test.skip(!isFullStack, "Set E2E_FULL_STACK=1 to run this test")
  test.skip(
    !TEST_PASSWORD,
    "Set E2E_USER_PASSWORD to the seeded test user's password",
  )

  test("sign in with email + password lands on /", async ({ page }) => {
    await page.goto("/signin")
    await page.getByLabel(/email/i).fill(TEST_EMAIL)
    await page.getByLabel(/^password$|^mot de passe$/i).fill(TEST_PASSWORD!)
    await page
      .getByRole("button", { name: /sign in|se connecter|connexion/i })
      .click()
    await expect(page).toHaveURL(/\/(account)?\/?$/, { timeout: 15_000 })
  })

  test("sign-out via the user-menu drawer lands on /signin", async ({ page }) => {
    // Re-do the sign-in to get a clean state.
    await page.goto("/signin")
    await page.getByLabel(/email/i).fill(TEST_EMAIL)
    await page.getByLabel(/^password$|^mot de passe$/i).fill(TEST_PASSWORD!)
    await page.getByRole("button", { name: /sign in|connexion/i }).click()
    await page.waitForURL(/\/(account)?\/?$/)

    // Open the user-menu drawer (avatar in the AppBar).
    await page.getByRole("button", { name: /open user menu|ouvrir le menu/i }).click()
    // Click the logout button at the bottom of the drawer.
    await page.getByRole("button", { name: /^logout$|^déconnexion$/i }).click()

    await expect(page).toHaveURL(/\/signin/)
  })

  test("invalid credentials surface the error toast", async ({ page }) => {
    await page.goto("/signin")
    await page.getByLabel(/email/i).fill("nonexistent@monark.test")
    await page
      .getByLabel(/^password$|^mot de passe$/i)
      .fill("definitely-wrong-pass")
    await page
      .getByRole("button", { name: /sign in|se connecter|connexion/i })
      .click()
    // The invalid-credentials path keeps the user on /signin and
    // surfaces an inline error.
    await expect(page).toHaveURL(/\/signin/)
    await expect(
      page.getByText(/email or password is incorrect|incorrect/i),
    ).toBeVisible({ timeout: 10_000 })
  })
})
