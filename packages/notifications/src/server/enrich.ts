import { BRANDING, brandingTemplateVars } from "@monark/branding"
import { WEBHOOK_DELIVERY_FAILURE_LIMIT } from "@monark/webhooks/contracts"
import type { TemplateVars } from "./template"
import type {
  NotificationDataMap,
  NotificationKind,
} from "../contracts/registry"

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
}

function formatDate(date: Date, locale: "en" | "fr"): string {
  return FORMATTERS[locale].format(date)
}

function resolveAppUrl(): string {
  // Prefer the runtime env var so per-deployment overrides (preview
  // branches, staging) work without a rebuild ; fall back to the
  // branding default. Both end up agreeing for the local dev case.
  const raw = process.env.APP_URL ?? brandingTemplateVars().appUrl
  return raw.replace(/\/$/, "")
}

// Global vars every template can rely on. Mixes the branding template
// vars (appName, tagline, supportEmail, brandPrimary, brandAccent) with
// the URL-derived links + a public `logoUrl` derived from
// `appUrl + BRANDING.logoSrc` so email templates can render the brand
// logo at the top without each template having to know the asset path.
// Re-read on every call so tests that mutate `process.env.APP_URL` see
// the new value.
function globalVars(): TemplateVars {
  const base = resolveAppUrl()
  const brand = brandingTemplateVars()
  // BRANDING.logoSrc is a webroot-relative path ("/monark-logo.svg").
  // Compose with appUrl to get a fetchable URL the recipient's mail
  // client can hit ; defaults work in dev too because the Next dev
  // server serves /public assets from the same origin emails are
  // generated with.
  const logoPath = BRANDING.logoSrc.startsWith("/")
    ? BRANDING.logoSrc
    : `/${BRANDING.logoSrc}`
  return {
    ...brand,
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
    logoUrl: `${base}${logoPath}`,
  }
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
): TemplateVars {
  const out: TemplateVars = { ...globalVars(), locale }

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (value === null || value === undefined) {
      out[key] = ""
    } else if (value instanceof Date) {
      out[key] = value.toISOString()
      out[`${key}Formatted`] = formatDate(value, locale)
    } else if (typeof value === "string") {
      out[key] = value
    } else {
      out[key] = String(value)
    }
  }

  switch (kind) {
    case "auth.new-device": {
      const d = data as NotificationDataMap["auth.new-device"]
      const where = [d.deviceCountry, d.deviceIp].filter(Boolean).join(" · ")
      // "Unknown location" is locale-aware ; reads better than an empty
      // string when neither country nor ip resolved (proxy stripping the
      // X-Forwarded-For, recognise running before geo enrichment, …).
      out.deviceWhere =
        where || (locale === "fr" ? "Lieu inconnu" : "Unknown location")
      break
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
      break
    case "webhooks.delivery-permanently-failed": {
      const d = data as NotificationDataMap["webhooks.delivery-permanently-failed"]
      out.webhookDeliveriesLink = `${out.appUrl}/admin/webhooks/${d.endpointId}/deliveries`
      out.failureLimit = String(WEBHOOK_DELIVERY_FAILURE_LIMIT)
      break
    }
    case "webhooks.endpoint-auto-disabled": {
      const d = data as NotificationDataMap["webhooks.endpoint-auto-disabled"]
      out.webhookEndpointLink = `${out.appUrl}/admin/webhooks/${d.endpointId}`
      break
    }
    default: {
      const _exhaustive: never = kind
      void _exhaustive
    }
  }

  return out
}
