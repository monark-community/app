# @monark/branding

Single source of truth for app brand identity. Every other package reads `BRANDING` from here ; downstream teams retarget the starter to a new product by setting the `BRANDING_*` env vars per deployment (the shipped defaults are neutral placeholders — do not hardcode a business into them). Full guide: [white-label.md](../../docs/technical-documentation/white-label.md).

## What's inside

`BRANDING` is the typed object. Fields:

| Field          | Used by                                                                                                 | Override env var         |
| -------------- | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| `appName`      | i18n placeholders, email subjects + bodies, `<title>` tag                                               | `BRANDING_APP_NAME`      |
| `tagline`      | Signin/signup subtitle, `<meta description>`                                                            | `BRANDING_TAGLINE`       |
| `supportEmail` | Footer, security/coc docs                                                                               | `BRANDING_SUPPORT_EMAIL` |
| `totpIssuer`   | Authenticator app label                                                                                 | `BRANDING_TOTP_ISSUER`   |
| `fromEmail`    | SMTP envelope (when `SMTP_FROM` isn't set)                                                              | `BRANDING_FROM_EMAIL`    |
| `appUrl`       | Email link templating (`accountLink`, `signInLink`, …)                                                  | `APP_URL`                |
| `brandPrimary` | The whole UI token set (buttons, focus rings, sidebar, `--chart-1`, NProgress) when no org color is set | `BRANDING_PRIMARY`       |
| `brandAccent`  | Second stop of the gradient surfaces (NProgress, avatar fallback)                                       | `BRANDING_ACCENT`        |
| `logoSrc`      | `BrandedAppLogo`, after the org's uploaded logo and before the placeholder                              | `BRANDING_LOGO_SRC`      |

## Usage

```ts
// Server, client, email templates, anywhere:
import { BRANDING, brandingTemplateVars } from "@monark/branding";

console.log(BRANDING.appName); // "App" by default (neutral placeholder ; set BRANDING_APP_NAME)
const vars = brandingTemplateVars(); // safe-to-interpolate subset
```

`brandingTemplateVars()` is what the notifications dispatcher merges into every template's variable map ; templates can reference `{{ appName }}`, `{{ tagline }}`, `{{ supportEmail }}`, `{{ appUrl }}`, `{{ brandPrimary }}`, `{{ brandAccent }}` without each subscriber threading them through. Note that the dispatcher deliberately **overrides** `brandPrimary` to black for email and lets the singleton org's `primaryColor` win instead — a mid-saturation brand color reads poorly on an email's white card. See [enrich.ts](../notifications/src/server/enrich.ts).

| Export                 | What it is                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRANDING`             | The resolved object : env override, else the neutral default.                                                                                                                                                                                                                                                                         |
| `DEFAULT_BRANDING`     | The shipped neutral defaults. Exported so consumers can compare against them.                                                                                                                                                                                                                                                         |
| `isBrandingConfigured` | `true` when the deployment actually set that field rather than falling through. Lets a consumer tell "the operator chose this" from "nobody configured anything" — the root layout uses it to decide whether `brandAccent` is a real second brand color, and the logo resolver to decide whether `logoSrc` beats the org placeholder. |
| `brandingTemplateVars` | The safe-to-interpolate subset, for template variable maps.                                                                                                                                                                                                                                                                           |
| `Branding`             | The field type.                                                                                                                                                                                                                                                                                                                       |

## Env-var override duality

Both `BRANDING_*` and `NEXT_PUBLIC_BRANDING_*` are honoured. Next.js only inlines `NEXT_PUBLIC_*` into the browser bundle, so client surfaces need the prefixed copy ; server surfaces (TOTP enrollment, email transport) read the un-prefixed copy. Setting both with the same value keeps the two in sync without the deployer having to think about runtime boundaries.

**Adding a field?** Add its literal `process.env.X` pair to `ENV_CANDIDATES` — do not derive the key name. Next's inlining is a static text substitution over literal member expressions, so a computed `process.env[key]` lookup survives into the client bundle as a read against a shim that carries nothing, and every field silently falls back to the default in the browser. A test guards the shape.

**Quote hex values in `.env`.** Node's `--env-file` parser reads an unquoted leading `#` as a comment, so `BRANDING_PRIMARY=#2563EB` resolves to an empty string and falls back to the default with no warning. Write `BRANDING_PRIMARY="#2563EB"`.

## White-label retargeting checklist

The shipped `DEFAULT_BRANDING` is intentionally generic — **do not edit it to a specific business**. Retarget per deployment via env vars:

1. Set the `BRANDING_*` env vars (and their `NEXT_PUBLIC_BRANDING_*` duplicates) to your product values — see the field table above and [white-label.md](../../docs/technical-documentation/white-label.md).
2. **Upload the org logo** at `/admin/organizations/<id>` — for a single-tenant deploy that is the logo that actually renders, and it is what app-sent emails embed. Square **JPEG / PNG / WebP**, max 2 MB ; the uploader rejects SVG. `BRANDING_LOGO_SRC` (a file you drop in `services/web/public/`) is the fallback for surfaces rendered before an org logo exists.
3. Set `BRANDING_PRIMARY` + `BRANDING_ACCENT` (quoted). `BRANDING_PRIMARY` themes the whole running UI when the singleton org has no `primaryColor` of its own ; the org color wins when it does. Email is the exception — see the note under Usage.
4. **Choose `BRANDING_TOTP_ISSUER` carefully**: it's what users see in their authenticator app, and changing it later requires every TOTP-enrolled user to re-enroll.
5. **Edit the three Supabase templates by hand** ([supabase/templates/{confirmation,recovery,email-change}.html](../../supabase/templates/)) plus their three `subject` lines in [supabase/config.toml](../../supabase/config.toml). Supabase renders these server-side and cannot reach `@monark/branding`, so there is no env seam. They ship **brand-neutral** — no product name, a `#18181b` accent, and a commented-out wordmark insertion point in each. Prefer a text wordmark over an image: Outlook desktop and parts of Gmail don't render SVG, and most clients block remote images by default. These are the first emails a new user receives, which is why the default carries no one's identity.
6. **Replace the favicon** at `services/web/src/app/favicon.ico`. No env var reaches it — Next serves the file as-is.

## Tier

`core` — every other module reads from this one ; can't be removed.

## What's NOT here

- Color tokens for the app shell (`--primary`, `--background`, etc.) — those live in `globals.css` as CSS custom properties tied to the chosen shadcn theme. The branding tokens here are the few values that have to leak into static contexts (emails, the QR code's surrounding container, the authenticator app's issuer label) where CSS variables can't reach.
- Per-locale brand strings — i18n catalogs interpolate `{appName}` from this module, so the product name stays consistent across en + fr.
