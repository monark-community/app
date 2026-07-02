/**
 * Single-source-of-truth for app brand identity. Edit `BRANDING` below
 * (or override per-deployment via env vars) and every surface — i18n
 * placeholders, email templates, TOTP issuer, the SMTP envelope, the
 * NProgress bar, the in-app logo — picks up the change without a
 * cross-codebase grep-replace.
 *
 * The values declared here are imported by both server and client code,
 * so every field has to be safe to ship to the browser. Anything genuinely
 * server-only (API keys, signing secrets) belongs in `process.env`, not
 * here.
 *
 * White-label retargeting:
 *
 *   1. Edit the defaults in `BRANDING` to your product (`appName`,
 *      `tagline`, etc.). For one-off staging deployments you can override
 *      via env vars without rebuilding.
 *   2. Drop your logo SVG into `services/web/public/<logoFileName>` and
 *      point `logoSrc` at it.
 *   3. Adjust `brandPrimary` / `brandAccent` ; the NProgress gradient,
 *      every email CTA button, and the TOTP/security accent all read
 *      from these tokens.
 *   4. The TOTP `issuer` is what users see in their authenticator app
 *      next to their account label ; choose it before launch because
 *      changing it later requires every user to re-enroll.
 *
 * Reading from a TS module rather than `.env` keeps the values in the
 * type system (autocomplete, refactor-safe, no runtime "string env was
 * undefined" boot crashes) and lets templates that bundle at build-time
 * (Next, the email templates) pick up the right value without an env
 * round-trip. Per-deployment overrides still work via the resolver
 * below ; they just funnel through one typed surface.
 */

export type Branding = {
  /** Product name as it appears in the UI, emails, and metadata. */
  appName: string;
  /** One-line product description shown in <meta description> + signin/signup subtitles. */
  tagline: string;
  /** Inbox a recipient can reply to ; surfaces in CODE_OF_CONDUCT, support links, etc. */
  supportEmail: string;
  /** Issuer name shown in the user's authenticator app on the TOTP enrollment page. */
  totpIssuer: string;
  /** Default outbound mail envelope when SMTP_FROM env var isn't set. */
  fromEmail: string;
  /** App URL used to build links inside emails (`{{ accountLink }}`, etc.). Override at runtime via `APP_URL`. */
  appUrl: string;
  /** Primary brand color (hex). Used for email CTA backgrounds + the NProgress trailing edge + brand wordmark. */
  brandPrimary: string;
  /** Accent (hex). Pairs with primary in the NProgress gradient + decorative surfaces. */
  brandAccent: string;
  /** Public path to the logo SVG. Resolved relative to `services/web/public/`. */
  logoSrc: string;
};

const DEFAULT_BRANDING: Branding = {
  appName: "Monark",
  tagline: "Fostering collaboration within the Web3 community.",
  supportEmail: "support@monark.io",
  totpIssuer: "Monark",
  fromEmail: "Monark <noreply@monark.io>",
  appUrl: "http://localhost:3000",
  brandPrimary: "#F0870C",
  brandAccent: "#EF3620",
  logoSrc: "/monark-logo.svg",
};

/**
 * Per-deployment overrides via env vars. Each is optional ; missing keys
 * fall through to the TS-declared default. NEXT_PUBLIC_ duplicates exist
 * for fields that have to reach the browser bundle (Next.js inlines only
 * `NEXT_PUBLIC_*` vars at build time).
 *
 * Server-side reads (notifications dispatch, the API's TOTP enrollment)
 * see the un-prefixed var ; client-side reads (NProgress color, app bar
 * wordmark) see the NEXT_PUBLIC_ duplicate. The resolver tries both, so
 * a `BRANDING_APP_NAME` set in the api `.env` AND a matching
 * `NEXT_PUBLIC_BRANDING_APP_NAME` in the web `.env` keeps the two
 * surfaces in sync without the deployer having to think about runtime
 * boundaries.
 */
function resolve<K extends keyof Branding>(key: K, envKey: string): Branding[K] {
  const env = process.env[envKey] ?? process.env[`NEXT_PUBLIC_${envKey}`] ?? null;
  if (env && env.length > 0) return env as Branding[K];
  return DEFAULT_BRANDING[key];
}

export const BRANDING: Branding = {
  appName: resolve("appName", "BRANDING_APP_NAME"),
  tagline: resolve("tagline", "BRANDING_TAGLINE"),
  supportEmail: resolve("supportEmail", "BRANDING_SUPPORT_EMAIL"),
  totpIssuer: resolve("totpIssuer", "BRANDING_TOTP_ISSUER"),
  fromEmail: resolve("fromEmail", "BRANDING_FROM_EMAIL"),
  appUrl: resolve("appUrl", "APP_URL"),
  brandPrimary: resolve("brandPrimary", "BRANDING_PRIMARY"),
  brandAccent: resolve("brandAccent", "BRANDING_ACCENT"),
  logoSrc: resolve("logoSrc", "BRANDING_LOGO_SRC"),
};

/**
 * The subset of branding values that are safe to interpolate into templated
 * strings (i18n messages, email bodies). Excludes asset paths because they
 * only make sense inside an `<img>` / public URL context.
 */
export type BrandingTemplateVars = {
  appName: string;
  tagline: string;
  supportEmail: string;
  appUrl: string;
  brandPrimary: string;
  brandAccent: string;
};

export function brandingTemplateVars(): BrandingTemplateVars {
  return {
    appName: BRANDING.appName,
    tagline: BRANDING.tagline,
    supportEmail: BRANDING.supportEmail,
    appUrl: BRANDING.appUrl,
    brandPrimary: BRANDING.brandPrimary,
    brandAccent: BRANDING.brandAccent,
  };
}
