import { expect, test } from "@playwright/test";
import { clearInbucket, extractFirstUrl, waitForLatestEmail } from "./helpers/inbucket";

/**
 * Forgot-password e2e flow. Drives the browser through the full
 * recovery loop :
 *
 *   1. /forgot-password → submit email → ack confirmation copy
 *   2. Inbucket inbox → wait for the recovery email → pluck the URL
 *   3. Visit URL → land on /auth/reset-password
 *   4. Submit a new password → land on /signin?passwordReset=1
 *   5. Sign in with the new password → land on /
 *
 * Skipped by default ; opt in with `E2E_FULL_STACK=1`. Requires the
 * Supabase local stack running (Inbucket on :54324) + a pre-seeded
 * test user account that the suite can request a reset against.
 *
 * The test user's credentials come from `E2E_RESET_EMAIL` and
 * `E2E_RESET_INITIAL_PASSWORD`. After the flow runs the user's
 * password gets rotated to the value below, so subsequent runs
 * should set `E2E_RESET_INITIAL_PASSWORD` to whatever the previous
 * run rotated it *to*. (Or rotate it back manually before re-running.)
 */

const isFullStack = process.env.E2E_FULL_STACK === "1";
const TEST_EMAIL = process.env.E2E_RESET_EMAIL ?? "reset-target@monark.test";
const NEW_PASSWORD = "Rotated-1nto-N3w-Pass!";

test.describe("forgot password full flow", () => {
  test.skip(!isFullStack, "Set E2E_FULL_STACK=1 to run this test");

  test.beforeEach(async () => {
    await clearInbucket(TEST_EMAIL);
  });

  test("request reset → click email link → submit new password → sign in", async ({ page }) => {
    // 1. Submit the forgot-password form.
    await page.goto("/forgot-password");
    await page.getByRole("textbox", { name: /email/i }).fill(TEST_EMAIL);
    await page.getByRole("button", { name: /send reset link|envoyer/i }).click();
    // The form switches to a "check your email" confirmation copy
    // regardless of whether the email exists (anti-enumeration).
    await expect(page.getByText(/check your inbox|consultez votre boîte/i)).toBeVisible();

    // 2. Poll Inbucket for the recovery email.
    const email = await waitForLatestEmail({
      to: TEST_EMAIL,
      subjectMatches: /reset|réinitialiser/i,
      timeoutMs: 20_000,
    });
    // 3. Pluck the recovery URL ; Supabase's template embeds it in
    //    both the HTML and the text fallback.
    const recoveryUrl = extractFirstUrl(
      email.html || email.text,
      /https?:\/\/[^\s<>"]+\/auth\/confirm[^\s<>"]+/i,
    );

    // 4. Visit the recovery URL ; Supabase's confirm route
    //    consumes the token + forwards us to /auth/reset-password
    //    with a live recovery session.
    await page.goto(recoveryUrl);
    await expect(page).toHaveURL(/\/auth\/reset-password/);

    // 5. Submit the new password.
    const newPasswordInput = page.getByLabel(/^new password$|nouveau mot de passe/i).first();
    await newPasswordInput.fill(NEW_PASSWORD);
    // Some flows also have a "confirm" field ; fill it when present.
    const confirmInput = page.getByLabel(/confirm.*password|confirmer.*mot de passe/i);
    if (await confirmInput.count()) {
      await confirmInput.first().fill(NEW_PASSWORD);
    }
    await page.getByRole("button", { name: /update password|mettre à jour/i }).click();

    // 6. Lands on /signin with the passwordReset=1 banner.
    await expect(page).toHaveURL(/\/signin\?passwordReset=1/);
    await expect(page.getByText(/password updated|mot de passe.*mis à jour/i)).toBeVisible();

    // 7. Sign in with the new password.
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/^password$|^mot de passe$/i).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: /sign in|se connecter|connexion/i }).click();
    await expect(page).toHaveURL(/\/(account)?\/?$/);
  });
});
