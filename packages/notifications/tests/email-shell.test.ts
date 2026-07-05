import { describe, expect, it } from "vitest";
import {
  getNotificationKindDef,
  getNotificationTemplate,
  listNotificationKinds,
  type NotificationDataMap,
  type NotificationKind,
} from "../src/contracts/registry";
import { registerCoreNotificationKinds } from "../src/server/register-core-kinds";
import { enrichVars } from "../src/server/enrich";
import { renderString } from "../src/server/template";
import { EMAIL_SHELL } from "../src/templates";

// Register at module-eval time so the describe-time `kinds` iteration
// sees the full set. The function is idempotent — safe under multiple
// imports, and other tests that reset the registry per-spec will
// re-register inside their own beforeEach.
registerCoreNotificationKinds();

// Regression guard for the email-shell rendering bug fixed on 2026-05-05.
// `dispatch.ts` previously called `renderString(EMAIL_SHELL, { locale,
// subject, body })` with a stripped vars object — `{{ appName }}`,
// `{{ logoUrl }}`, `{{ brandPrimary }}` etc. all rendered as literal
// text in the wordmark + logo + footer of every notification email.
// Tests below assert that the rendered HTML for every kind contains
// no `{{` substring after the shell wrap, catching the whole class of
// token-substitution failures in one shot.

// Per-kind payload factory. Each kind in `NotificationDataMap` needs a
// realistic shape to enrich ; we build a representative one below.
// New kinds added to the registry will fail the type check here until
// they're given a payload in the switch.
function payloadFor<K extends NotificationKind>(kind: K): NotificationDataMap[K] {
  const occurredAt = new Date("2026-05-01T14:30:00Z");
  // Type-narrowing per kind. Casts are fine inside the switch — the
  // return type tracks `kind`.
  switch (kind) {
    case "auth.new-device":
      return {
        deviceLabel: "Pixel 7",
        deviceCountry: "CA",
        deviceIp: "203.0.113.5",
        seenAt: occurredAt,
        revokeLink: "http://localhost:3000/auth/revoke-device/sample.token",
      } as NotificationDataMap[K];
    case "auth.password-changed":
      return { occurredAt } as NotificationDataMap[K];
    case "auth.totp-enabled":
      return { occurredAt } as NotificationDataMap[K];
    case "auth.totp-disabled":
      return { occurredAt } as NotificationDataMap[K];
    case "auth.all-devices-revoked":
      return { count: 3, occurredAt } as NotificationDataMap[K];
    case "auth.signed-in":
      return { deviceLabel: "Pixel 7", occurredAt } as NotificationDataMap[K];
    case "auth.device-revoked":
      return { deviceLabel: "Pixel 7", occurredAt } as NotificationDataMap[K];
    case "auth.recovery-code-used":
      return { remainingCodes: 7, occurredAt } as NotificationDataMap[K];
    case "auth.recovery-codes-regenerated":
      return { count: 10, occurredAt } as NotificationDataMap[K];
    case "account.email-changed":
      return {
        previousEmail: "old@example.com",
        newEmail: "new@example.com",
        occurredAt,
      } as NotificationDataMap[K];
    case "account.deletion-scheduled":
      return {
        completesAt: new Date("2026-05-15T00:00:00Z"),
      } as NotificationDataMap[K];
    case "account.deletion-canceled":
      return { occurredAt } as NotificationDataMap[K];
    case "webhooks.delivery-permanently-failed":
      return {
        endpointId: "wh_test_endpoint",
        endpointUrl: "https://receiver.example/hook",
        eventType: "rbac.role-assigned",
        attempts: 5,
        reason: "HTTP 500",
        scope: "org",
        occurredAt,
      } as NotificationDataMap[K];
    case "webhooks.endpoint-auto-disabled":
      return {
        endpointId: "wh_test_endpoint",
        endpointUrl: "https://receiver.example/hook",
        consecutiveFailures: 5,
        scope: "org",
        occurredAt,
      } as NotificationDataMap[K];
    default: {
      // Exhaustiveness check : adding a kind to NotificationDataMap
      // without updating this switch turns into a compile error.
      const exhaustive: never = kind;
      throw new Error(`Missing payload for kind ${exhaustive}`);
    }
  }
}

// Renders one kind's email body + the surrounding shell for a given
// locale. Mirrors what `dispatch.notify()` does for the EMAIL channel,
// minus the SMTP send + DB write.
function renderEmail<K extends NotificationKind>(
  kind: K,
  locale: "en" | "fr",
  overrides?: { logoUrl?: string | null; primaryColor?: string | null },
): { subject: string; html: string; text: string } {
  const def = getNotificationKindDef(kind);
  if (!def) throw new Error(`Kind not registered : ${kind}`);
  const vars = enrichVars(kind, payloadFor(kind), locale, overrides);
  const messages = getNotificationTemplate(def.template);
  if (!messages) throw new Error(`Template not registered for ${kind}`);
  const slot = messages[locale] ?? messages.en;
  const subject = renderString(slot.subject, vars);
  const innerHtml = renderString(slot.html, vars);
  const text = renderString(slot.text, vars);
  const html = renderString(EMAIL_SHELL, {
    ...vars,
    locale,
    subject,
    body: innerHtml,
  });
  return { subject, html, text };
}

describe("notifications/email-shell snapshot guard", () => {
  // One test per registered kind × each locale we ship. Adding a new
  // kind extends this matrix automatically because we iterate the
  // registry's keys.
  const kinds = listNotificationKinds();
  const locales = ["en", "fr"] as const;

  for (const kind of kinds) {
    for (const locale of locales) {
      it(`${kind} (${locale}) renders without literal {{ }} tokens`, () => {
        const { subject, html, text } = renderEmail(kind, locale);
        // The string-substitution renderer leaves unrecognised tokens
        // visible (template-author dev affordance). At dispatch time,
        // every token referenced by either the inner body or the
        // shell MUST have a value in `vars` — otherwise the recipient
        // sees raw `{{ appName }}` text.
        expect(html, `${kind} ${locale} html had unsubstituted tokens`).not.toContain("{{");
        expect(html).not.toContain("}}");
        expect(subject).not.toContain("{{");
        expect(subject).not.toContain("}}");
        expect(text).not.toContain("{{");
        expect(text).not.toContain("}}");
      });

      it(`${kind} (${locale}) shell carries the brand wordmark + renders <img> when an org logo is configured`, () => {
        // Drive the shell with a configured org logo override so the
        // `<img>` branch fires. The 2026-05-05 substitution bug this
        // test guards against was about `{{ logoUrl }}` not resolving ;
        // the logo path now lives behind `{{ logoHtml }}` which the
        // override populates with a full `<img>` tag.
        const { html } = renderEmail(kind, locale, {
          logoUrl: "https://example.test/configured-org-logo.png",
        });
        expect(html).toMatch(/<img src="https:\/\/example\.test\/[^"]+"\s/i);
        // The footer line `© {{ appName }}` should now read e.g. "© Monark".
        // We only check that "© " is followed by something that isn't `{{`.
        expect(html).toMatch(/©\s+\S/);
      });

      it(`${kind} (${locale}) shell omits the <img> entirely when no org logo is configured`, () => {
        // Default render path — no override, no `<img>` tag at all.
        // The wordmark below the logo slot still appears (separate
        // `{{ appName }}` substitution).
        const { html } = renderEmail(kind, locale);
        expect(html).not.toMatch(/<img\s/i);
        expect(html).toMatch(/©\s+\S/);
      });
    }
  }
});
