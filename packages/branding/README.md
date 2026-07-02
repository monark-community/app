# @monark/branding

Single source of truth for app brand identity. Every other package reads `BRANDING` from here ; downstream teams retarget the starter to a new product by editing one file (or setting the `BRANDING_*` env vars per deployment).

## What's inside

`BRANDING` is the typed object. Fields:

| Field          | Used by                                                   | Override env var         |
| -------------- | --------------------------------------------------------- | ------------------------ |
| `appName`      | i18n placeholders, email subjects + bodies, `<title>` tag | `BRANDING_APP_NAME`      |
| `tagline`      | Signin/signup subtitle, `<meta description>`              | `BRANDING_TAGLINE`       |
| `supportEmail` | Footer, security/coc docs                                 | `BRANDING_SUPPORT_EMAIL` |
| `totpIssuer`   | Authenticator app label                                   | `BRANDING_TOTP_ISSUER`   |
| `fromEmail`    | SMTP envelope (when `SMTP_FROM` isn't set)                | `BRANDING_FROM_EMAIL`    |
| `appUrl`       | Email link templating (`accountLink`, `signInLink`, …)    | `APP_URL`                |
| `brandPrimary` | NProgress bar, email CTA, accents                         | `BRANDING_PRIMARY`       |
| `brandAccent`  | NProgress gradient pair, secondary accents                | `BRANDING_ACCENT`        |
| `logoSrc`      | `<MonarkLogo>` / `<BrandLogo>` component, app bar         | `BRANDING_LOGO_SRC`      |

## Usage

```ts
// Server, client, email templates, anywhere:
import { BRANDING, brandingTemplateVars } from "@monark/branding";

console.log(BRANDING.appName); // "Monark" by default
const vars = brandingTemplateVars(); // safe-to-interpolate subset
```

`brandingTemplateVars()` is what the notifications dispatcher merges into every template's variable map ; templates can reference `{{ appName }}`, `{{ tagline }}`, `{{ supportEmail }}`, `{{ appUrl }}`, `{{ brandPrimary }}`, `{{ brandAccent }}` without each subscriber threading them through.

## Env-var override duality

Both `BRANDING_*` and `NEXT_PUBLIC_BRANDING_*` are honoured. Next.js only inlines `NEXT_PUBLIC_*` into the browser bundle, so client surfaces (NProgress, the appbar) need the prefixed copy ; server surfaces (TOTP enrollment, email transport) read the un-prefixed copy. Setting both with the same value keeps the two in sync without the deployer having to think about runtime boundaries.

## White-label retargeting checklist

1. Edit `DEFAULT_BRANDING` in [src/index.ts](src/index.ts) to your product values.
2. Drop your logo at `services/web/public/<logoFileName>` and update `logoSrc` to match. Email shells render the logo at the top via `${appUrl}${logoSrc}` ; SVG works locally but consider also exporting a 80×80 PNG for legacy mail clients (Outlook desktop has spotty SVG support).
3. Pick `brandPrimary` + `brandAccent` ; everything brand-coloured in the app + (notifications-rendered) emails reads from these.
4. **Choose `totpIssuer` carefully**: it's what users see in their authenticator app, and changing it later requires every TOTP-enrolled user to re-enroll.
5. **Edit the three Supabase templates by hand** ([supabase/templates/{confirmation,recovery,email-change}.html](../../supabase/templates/)). Supabase renders these server-side and can't reach `@monark/branding` at render time, so the brand name (`Monark`) and primary colour (`#F0870C`) are literal strings. Logo asset src uses `{{ .SiteURL }}/<logo-filename>` so it auto-tracks per-deployment URLs ; just rename the asset to match `logoSrc` in step 2.
6. (Optional) For per-deployment staging overrides without a rebuild, set `BRANDING_*` + `NEXT_PUBLIC_BRANDING_*` env vars.

## Tier

`core` — every other module reads from this one ; can't be removed.

## What's NOT here

- Color tokens for the app shell (`--primary`, `--background`, etc.) — those live in `globals.css` as CSS custom properties tied to the chosen shadcn theme. The branding tokens here are the few values that have to leak into static contexts (emails, the QR code's surrounding container, the authenticator app's issuer label) where CSS variables can't reach.
- Per-locale brand strings — i18n catalogs interpolate `{appName}` from this module, so the product name stays consistent across en + fr.
