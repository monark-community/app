import { expect, test } from "@playwright/test";

/**
 * Account-deletion grace flow. Drives the browser through :
 *
 *   1. /signin → /
 *   2. /account/danger → request deletion (typed-email confirmation)
 *   3. Land on /signin?deletionScheduledAt=… (signed out)
 *   4. Sign back in → land on /account/danger (grace lockdown)
 *   5. Click "Cancel scheduled deletion" → sidebar restores all 4 tabs
 *
 * Skipped by default ; opt in with `E2E_FULL_STACK=1`. Requires a
 * pre-seeded user (`E2E_USER_EMAIL` + `E2E_USER_PASSWORD`).
 *
 * The HARD-delete path (typed-email → permanent immediate delete)
 * isn't exercised here — that's destructive and the user row would
 * have to be re-seeded between runs. Covered by the unit + action
 * tests instead.
 */

const isFullStack = process.env.E2E_FULL_STACK === "1";
const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? "e2e-user@monark.test";
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD;

test.describe("account deletion grace flow", () => {
  test.skip(!isFullStack, "Set E2E_FULL_STACK=1 to run this test");
  test.skip(!TEST_PASSWORD, "Set E2E_USER_PASSWORD to the seeded test user's password");

  test("request deletion → sign back in → see grace lockdown → cancel → tabs restored", async ({
    page,
  }) => {
    // 1. Sign in.
    await page.goto("/signin");
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/^password$|^mot de passe$/i).fill(TEST_PASSWORD!);
    await page.getByRole("button", { name: /sign in|connexion/i }).click();
    await page.waitForURL(/^\/(account)?\/?$/);

    // 2. Open the danger tab + open the request-deletion dialog.
    await page.goto("/account/danger");
    await page.getByRole("button", { name: /request.*deletion|demander.*suppression/i }).click();

    // 3. Type the email to enable the confirm button + submit.
    await page.getByLabel(/type.*email|saisissez.*adresse/i).fill(TEST_EMAIL);
    await page
      .getByRole("button", {
        name: /^request deletion$|^demander la suppression$/i,
      })
      .click();

    // 4. Lands on /signin with the deletion-scheduled banner.
    await page.waitForURL(/\/signin\?deletionScheduledAt=/, {
      timeout: 15_000,
    });
    await expect(page.getByText(/deletion scheduled|suppression programmée/i)).toBeVisible();

    // 5. Sign back in — should land on /account/danger.
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/^password$|^mot de passe$/i).fill(TEST_PASSWORD!);
    await page.getByRole("button", { name: /sign in|connexion/i }).click();
    await page.waitForURL(/\/account\/danger/, { timeout: 15_000 });

    // 6. Sidebar collapses to profile + danger only.
    const securityLink = page.getByRole("link", { name: /security|sécurité/i });
    await expect(securityLink).toHaveCount(0);

    // 7. Click "Cancel scheduled deletion".
    await page
      .getByRole("button", {
        name: /cancel.*deletion|annuler.*suppression/i,
      })
      .click();
    // Toast confirms cancellation.
    await expect(page.getByText(/cancelled|annulée/i)).toBeVisible({ timeout: 10_000 });

    // 8. Sidebar should now show all 4 tabs again.
    await expect(page.getByRole("link", { name: /security|sécurité/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^notifications$/i })).toBeVisible();
  });
});
