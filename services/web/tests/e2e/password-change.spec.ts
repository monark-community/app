import { expect, test } from "@playwright/test";

/**
 * Password change e2e — requires a pre-seeded user (`E2E_USER_EMAIL`
 * + `E2E_USER_PASSWORD`). Drives the browser through :
 *
 *   1. /signin → land on /
 *   2. /account/security → click "Change password" → modal opens
 *   3. Fill current + new + confirm → submit
 *   4. Toast confirms ; modal closes
 *   5. Sign out
 *   6. Sign in with the NEW password → land on /
 *   7. Rotate it back to the original so the next test run has a
 *      consistent starting point
 *
 * Skipped by default ; gate with `E2E_FULL_STACK=1`.
 *
 * No TOTP enrolled : this spec covers the non-TOTP path. The
 * TOTP-gated rotation lives in `totp-lifecycle.spec.ts`.
 */

const isFullStack = process.env.E2E_FULL_STACK === "1";
const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? "e2e-user@monark.test";
const ORIGINAL_PASSWORD = process.env.E2E_USER_PASSWORD;
const TEMP_PASSWORD = "T3mp-Rot4t3-Test-x9mP";

test.describe("password change", () => {
  test.skip(!isFullStack, "Set E2E_FULL_STACK=1 to run this test");
  test.skip(!ORIGINAL_PASSWORD, "Set E2E_USER_PASSWORD to the seeded test user's password");

  test("change password, sign out, sign in with new, rotate back", async ({ page }) => {
    // 1. Sign in.
    await page.goto("/signin");
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/^password$|^mot de passe$/i).fill(ORIGINAL_PASSWORD!);
    await page.getByRole("button", { name: /sign in|se connecter|connexion/i }).click();
    await page.waitForURL(/^\/(account)?\/?$/, { timeout: 15_000 });

    // 2. Open the password modal from /account/security.
    await page.goto("/account/security");
    await page.getByRole("button", { name: /change password|modifier le mot de passe/i }).click();

    // 3. Fill the modal.
    await page.getByLabel(/current password|mot de passe actuel/i).fill(ORIGINAL_PASSWORD!);
    await page.getByLabel(/^new password$|^nouveau mot de passe$/i).fill(TEMP_PASSWORD);
    await page.getByLabel(/confirm.*password|confirmer.*mot de passe/i).fill(TEMP_PASSWORD);
    await page.getByRole("button", { name: /update password|mettre à jour/i }).click();

    // 4. Modal closes ; toast appears (Sonner uses role="status").
    await expect(page.getByText(/password updated|mot de passe.*mis à jour/i)).toBeVisible({
      timeout: 10_000,
    });

    // 5. Sign out via the user menu.
    await page.getByRole("button", { name: /open user menu|ouvrir le menu/i }).click();
    await page.getByRole("button", { name: /^logout$|^déconnexion$/i }).click();
    await page.waitForURL(/\/signin/);

    // 6. Sign in with the new password.
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/^password$|^mot de passe$/i).fill(TEMP_PASSWORD);
    await page.getByRole("button", { name: /sign in|se connecter|connexion/i }).click();
    await page.waitForURL(/^\/(account)?\/?$/, { timeout: 15_000 });

    // 7. Rotate back so the next run starts from the same state.
    await page.goto("/account/security");
    await page.getByRole("button", { name: /change password|modifier le mot de passe/i }).click();
    await page.getByLabel(/current password|mot de passe actuel/i).fill(TEMP_PASSWORD);
    await page.getByLabel(/^new password$|^nouveau mot de passe$/i).fill(ORIGINAL_PASSWORD!);
    await page.getByLabel(/confirm.*password|confirmer.*mot de passe/i).fill(ORIGINAL_PASSWORD!);
    await page.getByRole("button", { name: /update password|mettre à jour/i }).click();
    await expect(page.getByText(/password updated|mot de passe.*mis à jour/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("rejects an incorrect current password", async ({ page }) => {
    await page.goto("/signin");
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/^password$|^mot de passe$/i).fill(ORIGINAL_PASSWORD!);
    await page.getByRole("button", { name: /sign in|connexion/i }).click();
    await page.waitForURL(/^\/(account)?\/?$/);

    await page.goto("/account/security");
    await page.getByRole("button", { name: /change password|modifier le mot de passe/i }).click();
    await page.getByLabel(/current password|mot de passe actuel/i).fill("definitely-wrong-pass");
    await page.getByLabel(/^new password$|^nouveau mot de passe$/i).fill(TEMP_PASSWORD);
    await page.getByLabel(/confirm.*password|confirmer.*mot de passe/i).fill(TEMP_PASSWORD);
    await page.getByRole("button", { name: /update password|mettre à jour/i }).click();

    // Toast surfaces the invalidCurrentPassword error.
    await expect(
      page.getByText(/current password is incorrect|mot de passe actuel.*incorrect/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("blocks weak passwords", async ({ page }) => {
    await page.goto("/signin");
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/^password$|^mot de passe$/i).fill(ORIGINAL_PASSWORD!);
    await page.getByRole("button", { name: /sign in|connexion/i }).click();
    await page.waitForURL(/^\/(account)?\/?$/);

    await page.goto("/account/security");
    await page.getByRole("button", { name: /change password|modifier le mot de passe/i }).click();
    await page.getByLabel(/current password|mot de passe actuel/i).fill(ORIGINAL_PASSWORD!);
    // The strength meter rejects "password" outright.
    const weak = "password";
    await page.getByLabel(/^new password$|^nouveau mot de passe$/i).fill(weak);
    await page.getByLabel(/confirm.*password|confirmer.*mot de passe/i).fill(weak);
    // The Submit button stays disabled while the strength gate is
    // unmet. Verify it's not actually clickable.
    const submit = page.getByRole("button", {
      name: /update password|mettre à jour/i,
    });
    await expect(submit).toBeDisabled();
  });
});
