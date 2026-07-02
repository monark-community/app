import { expect, test } from "@playwright/test";
import { startReceiver, type ReceiverHandle } from "./helpers/webhook-receiver";

/**
 * Admin webhooks e2e. Drives the full delivery loop end-to-end :
 *
 *   1. Boot the mock receiver (tools/webhook-receiver.ts) in a child
 *      process on a random port.
 *   2. Sign in as the seeded admin user.
 *   3. /admin/webhooks → New endpoint → URL = receiver, subscribe to
 *      every rbac event via the picker's "rbac" group tri-state, hit
 *      Create. Capture the plaintext secret from the reveal banner.
 *   4. Trigger one of the rbac events by creating a custom role at
 *      /admin/rbac/roles/new.
 *   5. Wait for the receiver to capture the corresponding HTTP POST
 *      and assert the headers + body shape (signature header present,
 *      idempotency key present, body parses to the matching event
 *      payload).
 *   6. Cleanup : delete the temp role + the webhook endpoint.
 *
 * Skipped by default ; opt in with `E2E_FULL_STACK=1` and provide a
 * seeded admin user via `E2E_ADMIN_EMAIL` + `E2E_ADMIN_PASSWORD`.
 *
 * Verification mode is OFF on the receiver so the test passes even
 * before a `setWebhookSecretStore` is wired ; the spec asserts the
 * signature header is *present* + matches a `v1=...` shape, but
 * doesn't reverify the HMAC against the captured secret. (A separate
 * spec can flip the receiver into verify mode by passing
 * `verifySecret` once the secret store integration lands in CI.)
 */

const isFullStack = process.env.E2E_FULL_STACK === "1";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@monark.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe("admin webhooks — end-to-end delivery", () => {
  test.skip(!isFullStack, "Set E2E_FULL_STACK=1 to run this test");
  test.skip(!ADMIN_PASSWORD, "Set E2E_ADMIN_PASSWORD to the seeded admin user's password");

  let receiver: ReceiverHandle | null = null;

  test.beforeAll(async () => {
    receiver = await startReceiver();
  });

  test.afterAll(async () => {
    if (receiver) await receiver.stop();
  });

  test("create endpoint → trigger event → receiver captures signed delivery", async ({ page }) => {
    if (!receiver) throw new Error("receiver did not start");
    await receiver.clear();

    const stamp = Date.now().toString(36);
    const ENDPOINT_DESC = `e2e-${stamp}`;
    const ROLE_NAME = `E2E Webhook Trigger ${stamp}`;

    // 1. Sign in.
    await page.goto("/signin");
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/^password$|^mot de passe$/i).fill(ADMIN_PASSWORD!);
    await page.getByRole("button", { name: /sign in|connexion/i }).click();
    await page.waitForURL(/\/(account)?\/?$/, { timeout: 15_000 });

    // 2. Land on /admin/webhooks → click "New endpoint".
    await page.goto("/admin/webhooks");
    await expect(page).toHaveURL(/\/admin\/webhooks/);
    await page
      .getByRole("link", { name: /new endpoint|nouveau point/i })
      .first()
      .click();
    await page.waitForURL(/\/admin\/webhooks\/new/, { timeout: 10_000 });

    // 3. Fill the create form. URL points at the mock receiver.
    await page.getByLabel(/^url$/i).fill(`${receiver.url}/hook`);
    await page.getByLabel(/^description$/i).fill(ENDPOINT_DESC);
    // Tick the rbac group's tri-state header. Picker writes a
    // single prefix subscription because every rbac event shares
    // the `rbac.` prefix.
    await page.getByRole("checkbox", { name: /toggle every event in rbac/i }).check();

    await page
      .getByRole("button", {
        name: /^create endpoint$|^créer le point de terminaison$/i,
      })
      .click();

    // 4. Wait for the success toast + the secret-revealed banner.
    // The page redirects to /admin/webhooks/<id> and the secret is
    // visible in a green panel.
    await expect(page.getByText(/endpoint created|point de terminaison créé/i)).toBeVisible({
      timeout: 10_000,
    });
    await page.waitForURL(/\/admin\/webhooks\/[^/]+$/, { timeout: 10_000 });

    // 5. Trigger an rbac event by creating a custom role.
    await page.goto("/admin/rbac");
    await page
      .getByRole("link", { name: /create role|créer un rôle/i })
      .first()
      .click();
    await page.waitForURL(/\/admin\/rbac\/roles\/new/, { timeout: 10_000 });
    await page.getByLabel(/^name$|^nom$/i).fill(ROLE_NAME);
    await page.getByLabel(/^description$/i).fill("Created by the webhooks e2e ; safe to delete.");
    const firstPerm = page.getByRole("checkbox").first();
    await firstPerm.check();
    await page.getByRole("button", { name: /^create role$|^créer le rôle$/i }).click();
    await expect(page.getByText(/role created|rôle créé/i)).toBeVisible({
      timeout: 10_000,
    });

    // 6. Wait for the receiver to capture an `rbac.role-created`
    // delivery. The platform's worker drains the outbox on a 5 s
    // cadence ; allow up to 15 s for the round trip.
    const capture = await receiver.waitForCapture(
      (c) =>
        c.headers["webhook-event-type"] === "rbac.role-created" &&
        typeof c.json === "object" &&
        c.json !== null &&
        (c.json as { type?: string }).type === "rbac.role-created",
      15_000,
    );

    // Headers : the signing + idempotency + delivery-id surface
    // must be present. Signature is `v1=<hex>`.
    expect(capture.headers["webhook-signature"]).toMatch(/^v1=[0-9a-f]+$/);
    expect(capture.headers["webhook-timestamp"]).toMatch(/^\d+$/);
    expect(capture.headers["webhook-delivery-id"]).toBeTruthy();
    expect(capture.headers["webhook-delivery-idempotency-key"]).toBeTruthy();

    // Payload shape : DomainEvent under `data` ; the `roleKey`
    // field carries our created role's key.
    const data = (capture.json as { data: { roleKey?: string } }).data;
    expect(typeof data.roleKey).toBe("string");
    expect(data.roleKey?.toLowerCase()).toContain("e2e");

    // 7. Cleanup. Delete the role + the webhook endpoint so the
    // run is idempotent against a stuck DB.
    page.once("dialog", (dialog) => dialog.accept());
    await page.goto("/admin/rbac");
    await page.getByText(ROLE_NAME).first().click();
    await page.waitForURL(/\/admin\/rbac\/roles\/[^/]+$/, {
      timeout: 10_000,
    });
    await page.getByRole("button", { name: /delete role|supprimer le rôle/i }).click();
    await expect(page.getByText(/role deleted|rôle supprimé/i)).toBeVisible({
      timeout: 10_000,
    });

    await page.goto("/admin/webhooks");
    await page.getByText(ENDPOINT_DESC).first().click();
    await page.waitForURL(/\/admin\/webhooks\/[^/]+$/, { timeout: 10_000 });
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", {
        name: /delete endpoint|supprimer le point de terminaison/i,
      })
      .click();
    await expect(page.getByText(/endpoint deleted|point de terminaison supprimé/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
