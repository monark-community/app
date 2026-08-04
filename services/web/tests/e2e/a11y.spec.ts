import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Automated accessibility checks on the public (unauthenticated) pages — the
// same pages the routing smoke test uses, so no backend state is required.
// Runs as part of the (manually-triggered) e2e suite, not the push/PR gate.
//
// We fail on `serious` / `critical` axe violations against the WCAG 2.0/2.1
// A + AA rule sets ; `minor` / `moderate` are reported but don't block, so the
// bar can be tightened later without a big-bang cleanup.

const ANON_ROUTES = ["/signin", "/signup", "/forgot-password"];

for (const route of ANON_ROUTES) {
  test(`a11y: ${route} has no serious/critical violations`, async ({ page }) => {
    await page.goto(route);
    // Wait for the primary form control so we scan the hydrated page, not a
    // pre-hydration shell.
    await page.getByRole("button").first().waitFor({ state: "visible" });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    // Surface a readable summary in the failure message.
    const summary = blocking.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
    }));
    expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
  });
}
