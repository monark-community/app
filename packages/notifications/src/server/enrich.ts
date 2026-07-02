import { brandingTemplateVars } from "@monark/branding";
import { getDb } from "@monark/db";
import { WEBHOOK_DELIVERY_FAILURE_LIMIT } from "@monark/webhooks/contracts";
import type { TemplateVars } from "./template";
import type { NotificationDataMap, NotificationKind } from "../contracts/registry";

// Long-form locale-aware date formatting reused by every template that
// shows "this happened at X". Stable across browsers + servers because
// Intl.DateTimeFormat is built into Node + V8 with the same ICU tables.
const FORMATTERS: Record<"en" | "fr", Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }),
  fr: new Intl.DateTimeFormat("fr", {
    dateStyle: "medium",
    timeStyle: "short",
  }),
};

function formatDate(date: Date, locale: "en" | "fr"): string {
  return FORMATTERS[locale].format(date);
}

function resolveAppUrl(): string {
  // Prefer the runtime env var so per-deployment overrides (preview
  // branches, staging) work without a rebuild ; fall back to the
  // branding default. Both end up agreeing for the local dev case.
  const raw = process.env.APP_URL ?? brandingTemplateVars().appUrl;
  return raw.replace(/\/$/, "");
}

/**
 * Singleton organization's branding overrides for the email shell.
 * Each field returns null when not configured, falling the template
 * back to the BRANDING-derived defaults composed in `globalVars()` :
 * the starter-template `/public/<logo>.svg` for the logo and the
 * starter-orange for the accent bar + wordmark color.
 *
 * Single-tenant only : "singleton" = exactly one non-deleted
 * Organization row. Multi-tenant deploys fall through and the
 * recipient sees the BRANDING-derived fallback ; the right semantics
 * for multi-tenant (recipient's primary org, the org the event came
 * from, …) is a separate design question for when multi-tenant
 * actually ships.
 *
 * Async on its own so `enrichVars` itself can stay synchronous — the
 * dozen unit-test call sites pass `undefined` overrides and get
 * deterministic behavior without a DB round-trip.
 */
export async function resolveOrgBranding(): Promise<{
  logoUrl: string | null;
  primaryColor: string | null;
}> {
  try {
    const db = getDb();
    // `take: 2` keeps the >1-org case from accidentally pinning to an
    // arbitrary row ; matches the singleton-detection pattern in
    // `getBootstrapStatus()`.
    const rows = await db.organization.findMany({
      where: { deletedAt: null },
      select: { logoUrl: true, primaryColor: true },
      take: 2,
    });
    if (rows.length !== 1) return { logoUrl: null, primaryColor: null };
    const row = rows[0]!;
    const logoUrl = typeof row.logoUrl === "string" && row.logoUrl.length > 0 ? row.logoUrl : null;
    // Defensive : reject anything that doesn't pattern-match `#RGB` or
    // `#RRGGBB` even though the write path already validates ; an
    // operator-driven schema mutation that lands an invalid value
    // can't poison every outbound email's CSS.
    const color = row.primaryColor;
    const primaryColor =
      typeof color === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)
        ? color
        : null;
    return { logoUrl, primaryColor };
  } catch {
    // Best-effort : a transient DB error here just means the email
    // ships with the BRANDING fallback. Never block a notification
    // on this lookup.
    return { logoUrl: null, primaryColor: null };
  }
}

// `<img>` chunk emitted into the email shell. Kept inline rather than
// in the template so the shell can render NOTHING — not even a
// broken-image placeholder — when the deployer hasn't configured an
// org logo. The dimensions + inline styles match what the shell
// rendered statically before this branch was introduced ; if you
// change them, mirror the change in the shell-snapshot tests.
function buildLogoHtml(logoUrl: string, appName: string): string {
  return `<img src="${logoUrl}" alt="${appName}" width="40" height="40" style="display:block;border:0;outline:none;text-decoration:none;width:40px;height:40px;" />`;
}

// Global vars every template can rely on. Mixes the branding template
// vars (appName, tagline, supportEmail, brandAccent) with the URL-
// derived links. Email-specific defaults override two BRANDING values :
//   - `brandPrimary` → `#000000`. The starter's brand orange is
//     mid-saturation and reads as Monark-specific ; emails sent from a
//     deployer who hasn't set an org `primaryColor` should be neutral.
//   - `logoUrl` → empty + `logoHtml` → empty string. Emails render
//     NOTHING for the logo when the org hasn't uploaded one — no
//     starter-template `/public/<logo>.svg` fallback. The wordmark
//     stays as the recognisable identity element.
// Both defaults are overridden by `enrichVars` when the dispatcher
// passes `overrides.{logoUrl, primaryColor}` from the singleton org.
// Re-read on every call so tests that mutate `process.env.APP_URL`
// see the new value.
function globalVars(): TemplateVars {
  const base = resolveAppUrl();
  const brand = brandingTemplateVars();
  return {
    ...brand,
    // Email-specific neutral default ; org's primaryColor overrides
    // when configured (see `enrichVars`).
    brandPrimary: "#000000",
    appUrl: base,
    // The deletion-scheduled email surfaces `accountLink` as the
    // "cancel deletion" CTA, so it points straight at the danger
    // tab where the cancel button lives.
    accountLink: `${base}/account/danger`,
    // `securityLink` and `revokeLink` both surface "review or revoke
    // this device" affordances ; the trusted-devices list lives in
    // the security tab now (and so does the rest of the credential
    // management chrome).
    securityLink: `${base}/account/security`,
    revokeLink: `${base}/account/security`,
    signInLink: `${base}/signin`,
    // Logo defaults are empty ; the dispatcher passes the org's
    // configured logoUrl as an override and `enrichVars` populates
    // both `logoUrl` (raw URL for direct use) and `logoHtml` (the
    // `<img>` tag the shell emits). When no org logo exists, the
    // shell's `{{ logoHtml }}` substitution lands empty — no broken
    // image placeholder, just the wordmark below.
    logoUrl: "",
    logoHtml: "",
  };
}

/**
 * Turns the raw `NotificationDataMap[K]` payload that callers hand to
 * `notify()` into the flat `Record<string, string>` the template renderer
 * actually interpolates. Three layers, in order:
 *
 *   1. Stringify every raw field. Dates → ISO so they're at least visible
 *      if the template forgets the `*Formatted` companion ; non-strings →
 *      `String(value)`.
 *   2. For every Date field K, add `${K}Formatted` ; locale-aware via
 *      `Intl.DateTimeFormat`. Templates use this for human-friendly text
 *      (`occurredAtFormatted`, `seenAtFormatted`, `completesAtFormatted`,
 *      …) and the raw ISO stays available too if a debug surface ever
 *      needs it.
 *   3. Per-kind derivations. Today only `auth.new-device` needs one
 *      (`deviceWhere` from country + ip) ; the switch is exhaustive so a
 *      new kind that needs derivation is caught at compile time.
 *
 * Plus the result is layered on top of the global link map so every
 * template can reference `accountLink`, `securityLink`, `revokeLink`,
 * `signInLink`, `appUrl` without each kind having to thread them through.
 *
 * The locale parameter ("en" | "fr") matches the template-locale slot
 * the dispatcher already picks ; defaulting to "en" everywhere keeps
 * the function pure for unit tests.
 */
export function enrichVars<K extends NotificationKind>(
  kind: K,
  data: NotificationDataMap[K],
  locale: "en" | "fr",
  overrides?: {
    /**
     * Org's uploaded logo URL. When set, populates both `{{ logoUrl }}`
     * (raw URL) and `{{ logoHtml }}` (the full `<img>` tag the shell
     * emits). When null / undefined / empty, the shell renders NO logo
     * at all — `{{ logoHtml }}` lands as the empty string and the
     * recipient sees just the wordmark + the rest of the email body.
     * No fallback to the starter-template `/public/<logo>.svg`.
     */
    logoUrl?: string | null;
    /**
     * Wins over `{{ brandPrimary }}` (used for the email's top accent
     * bar + wordmark color) when the singleton org has a configured
     * primary color. Falls back to the email-specific neutral default
     * (`#000000`) defined in `globalVars()` — NOT to BRANDING's
     * starter orange. White is deliberately not the default for
     * emails (invisible on the white card background) ; black gives
     * a neutral look that doesn't impose the starter's Monark identity.
     */
    primaryColor?: string | null;
  },
): TemplateVars {
  const out: TemplateVars = { ...globalVars(), locale };
  if (typeof overrides?.logoUrl === "string" && overrides.logoUrl.length > 0) {
    out.logoUrl = overrides.logoUrl;
    out.logoHtml = buildLogoHtml(overrides.logoUrl, out.appName ?? "");
  }
  if (typeof overrides?.primaryColor === "string" && overrides.primaryColor.length > 0) {
    out.brandPrimary = overrides.primaryColor;
  }

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (value === null || value === undefined) {
      out[key] = "";
    } else if (value instanceof Date) {
      out[key] = value.toISOString();
      out[`${key}Formatted`] = formatDate(value, locale);
    } else if (typeof value === "string") {
      out[key] = value;
    } else {
      out[key] = String(value);
    }
  }

  switch (kind) {
    case "auth.new-device": {
      const d = data as NotificationDataMap["auth.new-device"];
      const where = [d.deviceCountry, d.deviceIp].filter(Boolean).join(" · ");
      // "Unknown location" is locale-aware ; reads better than an empty
      // string when neither country nor ip resolved (proxy stripping the
      // X-Forwarded-For, recognise running before geo enrichment, …).
      out.deviceWhere = where || (locale === "fr" ? "Lieu inconnu" : "Unknown location");
      break;
    }
    case "auth.password-changed":
    case "auth.totp-enabled":
    case "auth.totp-disabled":
    case "auth.all-devices-revoked":
    case "account.email-changed":
    case "account.deletion-scheduled":
    case "account.deletion-canceled":
      // No per-kind derivations beyond the auto Date → Formatted +
      // global links above. Listed explicitly so adding a new kind is
      // a compile error here until its derivation (or lack thereof) is
      // declared.
      break;
    case "webhooks.delivery-permanently-failed": {
      const d = data as NotificationDataMap["webhooks.delivery-permanently-failed"];
      out.webhookDeliveriesLink = `${out.appUrl}/admin/webhooks/${d.endpointId}/deliveries`;
      out.failureLimit = String(WEBHOOK_DELIVERY_FAILURE_LIMIT);
      break;
    }
    case "webhooks.endpoint-auto-disabled": {
      const d = data as NotificationDataMap["webhooks.endpoint-auto-disabled"];
      out.webhookEndpointLink = `${out.appUrl}/admin/webhooks/${d.endpointId}`;
      break;
    }
    default: {
      // Extended-module kinds (registered outside this package, e.g. calendar.event.reminder)
      // fall here. Their template vars are fully handled by the generic key→value loop above.
      // Add a case above when a new CORE kind needs per-kind derivations.
      void kind;
    }
  }

  return out;
}
