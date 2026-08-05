import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { BRANDING } from "@monark/branding";
import { DEFAULT_LOCALE, isLocale } from "./config";

// Reads the user's preferred locale from the `NEXT_LOCALE` cookie (set by the
// locale switcher) and falls back to English. Called on every request by the
// next-intl server runtime; results are cached per-request.

const BRAND_PLACEHOLDERS: Record<string, string> = {
  "{appName}": BRANDING.appName,
  "{supportEmail}": BRANDING.supportEmail,
  "{tagline}": BRANDING.tagline,
};

/**
 * Walks the loaded message tree and replaces brand placeholders with the
 * runtime branding values. Catalogs use `{appName}` / `{supportEmail}`
 * literals so they stay product-agnostic at source ; downstream teams
 * retarget the starter via `@monark/branding` without touching the
 * catalog files.
 *
 * Done as a static substitution before next-intl ever sees the strings,
 * not via `defaultTranslationValues` ; that option was removed in
 * next-intl v4 and is the source of `FORMATTING_ERROR: variable was not
 * provided` at every call site that referenced one of these tokens.
 *
 * Pure ICU placeholders unrelated to branding (`{email}`, `{count}`,
 * `{date}`, …) flow through untouched because we only swap exact
 * matches against the keys in `BRAND_PLACEHOLDERS`. The values we
 * splice in come from a typed config module — no untrusted input — so
 * we don't need to escape ICU metacharacters.
 */
function substituteBranding(value: unknown): unknown {
  if (typeof value === "string") {
    let out = value;
    for (const [placeholder, replacement] of Object.entries(BRAND_PLACEHOLDERS)) {
      if (out.includes(placeholder)) {
        out = out.split(placeholder).join(replacement);
      }
    }
    return out;
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteBranding(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = substituteBranding(child);
    }
    return out;
  }
  return value;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  const messages = (await import(`../messages/${locale}.json`)).default;
  const branded = substituteBranding(messages) as typeof messages;

  return { locale, messages: branded };
});
