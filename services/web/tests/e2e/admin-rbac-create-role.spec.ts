import { expect, test } from "@playwright/test"

/**
 * Admin RBAC create-role e2e. Drives the browser through :
 *
 *   1. /signin → sign in as the seeded admin user
 *   2. /admin/rbac → click "Create role"
 *   3. /admin/rbac/roles/new → fill name + description + a permission,
 *      click Create
 *   4. Land back on /admin/rbac with the new role visible in the list
 *   5. Click the new row → /admin/rbac/roles/[id] → click Delete role,
 *      confirm. Back on /admin/rbac without the row.
 *
 * Skipped by default ; opt in with `E2E_FULL_STACK=1`. Requires a
 * pre-seeded admin user (`E2E_ADMIN_EMAIL` + `E2E_ADMIN_PASSWORD`).
 *
 * Tests the role-management surface end-to-end : the editor's name +
 * description + permission grid + the toast on create + the parent
 * list refresh + the delete confirm-dialog flow. Does not exercise
 * the color picker or the bulk category-toggle (covered by component
 * tests of role-editor).
 */

const isFullStack = process.env.E2E_FULL_STACK === "1"
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@monark.test"
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD

test.describe("admin rbac — create + delete custom role", () => {
  test.skip(!isFullStack, "Set E2E_FULL_STACK=1 to run this test")
  test.skip(
    !ADMIN_PASSWORD,
    "Set E2E_ADMIN_PASSWORD to the seeded admin user's password",
  )

  test(
    "create a custom role then delete it",
    async ({ page }) => {
      // Stable but unique-per-run name so re-runs against a stuck DB
      // don't collide on the slug-derived role key.
      const stamp = Date.now().toString(36)
      const ROLE_NAME = `E2E Mod ${stamp}`

      // 1. Sign in.
      await page.goto("/signin")
      await page.getByLabel(/email/i).fill(ADMIN_EMAIL)
      await page
        .getByLabel(/^password$|^mot de passe$/i)
        .fill(ADMIN_PASSWORD!)
      await page.getByRole("button", { name: /sign in|connexion/i }).click()
      await page.waitForURL(/\/(account)?\/?$/, { timeout: 15_000 })

      // 2. Navigate to /admin/rbac.
      await page.goto("/admin/rbac")
      await expect(page).toHaveURL(/\/admin\/rbac/)

      // 3. Open the create-role page.
      await page
        .getByRole("link", { name: /create role|créer un rôle/i })
        .first()
        .click()
      await page.waitForURL(/\/admin\/rbac\/roles\/new/, { timeout: 10_000 })

      // 4. Fill the editor + grant a permission.
      await page.getByLabel(/^name$|^nom$/i).fill(ROLE_NAME)
      await page
        .getByLabel(/^description$/i)
        .fill("Created by the e2e suite ; safe to delete.")
      // Pick the first available permission checkbox. Custom roles
      // typically need at least one ; without one the role is
      // creatable but useless.
      const firstPerm = page.getByRole("checkbox").first()
      await firstPerm.check()

      // 5. Submit + expect the success toast + the list refresh.
      await page
        .getByRole("button", { name: /^create role$|^créer le rôle$/i })
        .click()
      await expect(page.getByText(/role created|rôle créé/i)).toBeVisible({
        timeout: 10_000,
      })
      await page.waitForURL(/\/admin\/rbac\/?$/, { timeout: 10_000 })
      await expect(page.getByText(ROLE_NAME)).toBeVisible({ timeout: 10_000 })

      // 6. Open the role detail + delete it.
      await page.getByText(ROLE_NAME).first().click()
      await page.waitForURL(/\/admin\/rbac\/roles\/[^/]+/, { timeout: 10_000 })
      await page
        .getByRole("button", { name: /delete role|supprimer le rôle/i })
        .click()
      // The confirm prompt is a `window.confirm`. Playwright's
      // dialog handler is registered up-front so it fires when the
      // delete button triggers it.
      page.once("dialog", (dialog) => dialog.accept())

      await expect(page.getByText(/role deleted|rôle supprimé/i)).toBeVisible({
        timeout: 10_000,
      })
      await page.waitForURL(/\/admin\/rbac\/?$/, { timeout: 10_000 })
      // Row is gone.
      await expect(page.getByText(ROLE_NAME)).not.toBeVisible()
    },
  )
})
