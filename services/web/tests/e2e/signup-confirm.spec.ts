import { expect, test } from "@playwright/test";
import { clearInbucket, extractFirstUrl, waitForLatestEmail } from "./helpers/inbucket";

/**
 * Signup → confirm-email full flow. Drives the browser through :
 *
 *   1. /signup → fill email + password → submit
 *   2. Land on /signup/check-email?email=… (or /account if auto-
 *      confirm is on, which Supabase's local stack often is)
 *   3. Poll Inbucket for the confirmation email
 *   4. Click the confirmation link → land on /
 *
 * Skipped by default ; opt in with `E2E_FULL_STACK=1`. Each run uses
 * a fresh email address so the test doesn't fight with previous
 * runs' Supabase user rows. Requires Supabase local stack +
 * Inbucket on port 54324.
 *
 * Strong password chosen to clear the strength meter without test
 * flakiness from the HIBP check (the chosen value isn't in the top
 * leak corpora).
 */

const isFullStack = process.env.E2E_FULL_STACK === "1";
const STRONG_PASSWORD = "T3st-CrumblE-Vine-Q9zP";

function freshEmail(): string {
  // Inbucket addresses by mailbox name ; the part before the @ is
  // what matters. Uniquify per run so no inbox cross-contaminates.
  return `signup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@monark.test`;
}

test.describe("signup confirm full flow", () => {
  test.skip(!isFullStack, "Set E2E_FULL_STACK=1 to run this test");

  test("submit signup → email arrives → click link → account confirmed", async ({ page }) => {
    const email = freshEmail();
    await clearInbucket(email);

    // 1. Submit the signup form.
    await page.goto("/signup");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password$|^mot de passe$/i).fill(STRONG_PASSWORD);
    await page.getByRole("button", { name: /create account|créer le compte/i }).click();

    // 2. Either landed on check-email (verification required) or
    //    on / (auto-confirm). Both are valid landing pages
    //    depending on the local stack's confirmation setting.
    await page.waitForURL(
      (url) => /\/signup\/check-email/.test(url.pathname) || /^\/(account)?\/?$/.test(url.pathname),
      { timeout: 15_000 },
    );

    // If auto-confirm is on we're done — the session is live.
    if (!page.url().includes("check-email")) {
      await expect(page).toHaveURL(/^\/(account)?\/?$/);
      return;
    }

    // 3. Poll Inbucket for the confirmation email.
    const message = await waitForLatestEmail({
      to: email,
      subjectMatches: /confirm|verify|monark/i,
      timeoutMs: 20_000,
    });
    // 4. Pluck the confirmation URL from the body.
    const confirmUrl = extractFirstUrl(
      message.html || message.text,
      /https?:\/\/[^\s<>"]+\/auth\/confirm[^\s<>"]+/i,
    );
    // 5. Visit the URL → Supabase verifies the token + our route
    //    handler signs the user in + redirects to /.
    await page.goto(confirmUrl);
    await expect(page).toHaveURL(/^\/(account)?\/?$/, { timeout: 15_000 });
  });

  test("resending the confirmation enqueues a second email", async ({ page }) => {
    const email = freshEmail();
    await clearInbucket(email);

    await page.goto("/signup");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password$|^mot de passe$/i).fill(STRONG_PASSWORD);
    await page.getByRole("button", { name: /create account|créer le compte/i }).click();

    // Skip if we landed on / (auto-confirm is on, no resend
    // affordance).
    await page.waitForURL(
      (url) => /\/signup\/check-email/.test(url.pathname) || /^\/(account)?\/?$/.test(url.pathname),
    );
    test.skip(
      !page.url().includes("check-email"),
      "Auto-confirm is on ; resend affordance not visible.",
    );

    // Wait for the first email to land so we don't race the resend.
    const first = await waitForLatestEmail({ to: email, timeoutMs: 20_000 });

    // Click "Resend" ; Inbucket should accumulate a second message.
    await page.getByRole("button", { name: /resend|renvoyer/i }).click();
    // Poll for the second message — distinguish by id.
    let secondId = first.id;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && secondId === first.id) {
      const latest = await waitForLatestEmail({
        to: email,
        timeoutMs: 5_000,
      }).catch(() => null);
      if (latest && latest.id !== first.id) {
        secondId = latest.id;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(secondId).not.toBe(first.id);
  });
});
