import { expect, test } from "@playwright/test";

/**
 * Admin users — invite flow e2e. Drives the browser through :
 *
 *   1. /signin → sign in as the seeded admin user
 *   2. /admin/users → click "Invite user"
 *   3. Fill the dialog (name, email, role) → Send
 *   4. Toast "Invite sent." appears
 *   5. The new email shows up in the invites table
 *   6. Revoke the invite from the row affordance
 *
 * Skipped by default ; opt in with `E2E_FULL_STACK=1`. Requires a
 * pre-seeded admin user (`E2E_ADMIN_EMAIL` + `E2E_ADMIN_PASSWORD`)
 * AND single-tenant mode (the singleton org is auto-pinned in the
 * dialog ; multi-tenant adds the org picker step which is its own
 * spec when needed). The seeded admin must also belong to the org
 * (or be the singleton's owner) so `adminCreate` doesn't 403.
 *
 * Generates a unique invite email per run so re-runs against a
 * stuck DB don't collide on the org+email unique tuple.
 */

const isFullStack = process.env.E2E_FULL_STACK === "1";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@monark.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe("admin users — invite flow", () => {
  test.skip(!isFullStack, "Set E2E_FULL_STACK=1 to run this test");
  test.skip(!ADMIN_PASSWORD, "Set E2E_ADMIN_PASSWORD to the seeded admin user's password");

  test("invite a user then revoke the pending invite", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const INVITE_EMAIL = `e2e-invite-${stamp}@monark.test`;
    const INVITE_NAME = `E2E Invitee ${stamp}`;

    // 1. Sign in.
    await page.goto("/signin");
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/^password$|^mot de passe$/i).fill(ADMIN_PASSWORD!);
    await page.getByRole("button", { name: /sign in|connexion/i }).click();
    await page.waitForURL(/\/(account)?\/?$/, { timeout: 15_000 });

    // 2. Navigate to /admin/users.
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/users/);

    // 3. Open the invite dialog.
    await page.getByRole("button", { name: /invite user|inviter un utilisateur/i }).click();
    // The dialog title is the unambiguous landing-state assertion.
    await expect(
      page.getByRole("heading", {
        name: /invite a new user|inviter un nouvel utilisateur/i,
      }),
    ).toBeVisible();

    // 4. Fill the form. Order matters : roles only enable once the
    // org is resolved (single-tenant : automatic ; multi-tenant
    // would need an org pick first — out of scope for this spec).
    await page.getByLabel(/^full name$|^nom complet$/i).fill(INVITE_NAME);
    await page.getByLabel(/^email$/i).fill(INVITE_EMAIL);

    // Open the role select + pick the first item (typically ADMIN
    // built-in or a seed-time custom role ; either is fine here).
    await page.getByRole("combobox").first().click();
    await page.getByRole("option").first().click();

    // 5. Submit.
    await page.getByRole("button", { name: /^send invite$|^envoyer$/i }).click();
    await expect(page.getByText(/invite sent|invitation envoyée/i)).toBeVisible({
      timeout: 10_000,
    });

    // 6. The invite row should appear in the list. Refresh first
    // since the dialog's onSuccess invalidates the list query but
    // a slow round-trip might not have repainted yet.
    await page.reload();
    await expect(page.getByText(INVITE_EMAIL)).toBeVisible({
      timeout: 10_000,
    });

    // 7. Revoke from the row affordance. The aria-label encodes
    // the email so the right row is targeted.
    await page
      .getByRole("button", {
        name: new RegExp(`(revoke invite for|révoquer l'invitation pour) ${INVITE_EMAIL}`, "i"),
      })
      .click();
    await expect(page.getByText(/invite revoked|invitation révoquée/i)).toBeVisible({
      timeout: 10_000,
    });

    // 8. Row gone after revoke.
    await page.reload();
    await expect(page.getByText(INVITE_EMAIL)).not.toBeVisible();
  });
});
