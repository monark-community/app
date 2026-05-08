import { expect, test } from "@playwright/test"
import {
  clearInbucket,
  extractFirstUrl,
  waitForLatestEmail,
} from "./helpers/inbucket"

/**
 * Full happy-path signup → email-verify flow. Skipped by default; opt in
 * with `E2E_FULL_STACK=1`. The suite assumes:
 *   - the web dev server is reachable at WEB_URL (default localhost:3000);
 *   - Supabase is running locally and routing email through Inbucket
 *     (the bundled mail catcher in the Supabase CLI's `supabase start`
 *     stack ; runs on port 54324). Mailpit support exists in
 *     [helpers/mailpit.ts](./helpers/mailpit.ts) for local stacks that
 *     swap it in, but CI runs against `supabase start` and uses
 *     Inbucket — keeping this spec on the same helper as the rest of
 *     the email-using e2e suite (forgot-password, signup-confirm).
 *
 * If any of those aren't up, the test is skipped rather than failing —
 * routing-only smoke runs (auth-routing.spec.ts) still pass on bare CI.
 */

const isFullStack = process.env.E2E_FULL_STACK === "1"

test.describe("signup happy path", () => {
  test.skip(!isFullStack, "Set E2E_FULL_STACK=1 to run this test")

  test("signup triggers a verification email and the link verifies the account", async ({
    page,
  }) => {
    const uniq = Date.now()
    const email = `e2e+${uniq}@monark.test`
    const password = "Tg7!hP9q*xLb-e2e"

    // Start each run with an empty mailbox so the polling helper can't
    // latch onto a stale message from a previous attempt. Inbucket's
    // clear is per-mailbox (vs Mailpit's global flush), so we pass
    // the recipient address directly.
    await clearInbucket(email)

    await page.goto("/signup")

    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/password|mot de passe/i).first().fill(password)

    await page
      .getByRole("button", { name: /create account|créer le compte/i })
      .click()

    // Signup should park the user on a "check your email" surface ; the exact
    // copy is i18n'd, so we match a stable URL pattern instead.
    await expect(page).toHaveURL(/\/(signup|signin|verify)/, { timeout: 10_000 })

    const message = await waitForLatestEmail({
      to: email,
      // Supabase's verification subject; if the sender is reconfigured the
      // matcher should be relaxed to /confirm|verify/i.
      subjectMatches: /confirm|verify|activez|vérifiez/i,
    })

    const verifyUrl = extractFirstUrl(message.html || message.text)
    await page.goto(verifyUrl)

    // After confirm, the user should be either signed-in (account) or
    // bounced to /signin with a success banner. Either is acceptable.
    await expect(page).toHaveURL(/\/(account|signin)/, { timeout: 10_000 })
  })
})
