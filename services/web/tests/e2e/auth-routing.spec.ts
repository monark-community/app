import { expect, test } from "@playwright/test";

// Smoke-level routing checks; runs without backend state. Verifies that the
// public auth pages render, the account page enforces auth, and the TOTP
// challenge page gates on the pending cookie.

test.describe("auth routing smoke", () => {
  test("/signin renders the sign-in form", async ({ page }) => {
    await page.goto("/signin");
    await expect(
      page.getByRole("button", { name: /sign in|connexion|se connecter/i }),
    ).toBeVisible();
  });

  test("/signup renders the create-account form", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("button", { name: /create account|créer le compte/i }),
    ).toBeVisible();
  });

  test("/account redirects to /signin when not authenticated", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/signin(\?|$)/);
  });

  test("/admin redirects to /signin when not authenticated", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/signin(\?|$)/);
  });

  test("/signin/totp redirects to /signin when no challenge is pending", async ({ page }) => {
    await page.goto("/signin/totp");
    await expect(page).toHaveURL(/\/signin(\?|$)/);
  });
});
