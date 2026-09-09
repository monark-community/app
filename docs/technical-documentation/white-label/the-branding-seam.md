# The branding seam

Everything user-visible that names or colors the product flows through one
module: [`@monark/branding`](../../../packages/branding/src/index.ts). It exposes a
single typed `BRANDING` object, imported by both server and client code, so a
brand change lands everywhere ; i18n copy, email templates, the TOTP issuer, the
SMTP envelope, the NProgress bar, the in-app logo ; without a cross-codebase
grep-replace.

| Field          | Env var (server / client)                                       | Feeds                                                                  |
| -------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `appName`      | `BRANDING_APP_NAME` / `NEXT_PUBLIC_BRANDING_APP_NAME`           | `{appName}` in i18n, page titles, app bar wordmark                     |
| `tagline`      | `BRANDING_TAGLINE` / `NEXT_PUBLIC_BRANDING_TAGLINE`             | `{tagline}` in i18n, `<meta description>`, sign-in                     |
| `supportEmail` | `BRANDING_SUPPORT_EMAIL` / `NEXT_PUBLIC_BRANDING_SUPPORT_EMAIL` | `{supportEmail}` in i18n, code-of-conduct                              |
| `totpIssuer`   | `BRANDING_TOTP_ISSUER`                                          | Name shown in the user's authenticator app                             |
| `fromEmail`    | `BRANDING_FROM_EMAIL`                                           | Outbound mail envelope (unless `SMTP_FROM` is set)                     |
| `appUrl`       | `APP_URL`                                                       | Links built inside emails                                              |
| `brandPrimary` | `BRANDING_PRIMARY` / `NEXT_PUBLIC_BRANDING_PRIMARY`             | The whole UI colour: buttons, focus rings, sidebar, chart-1, NProgress |
| `brandAccent`  | `BRANDING_ACCENT` / `NEXT_PUBLIC_BRANDING_ACCENT`               | Second stop of the gradient surfaces (NProgress, avatar fallback)      |
| `logoSrc`      | `BRANDING_LOGO_SRC` / `NEXT_PUBLIC_BRANDING_LOGO_SRC`           | The in-app logo (path under `services/web/public/`)                    |

### Why two env vars per field

Next.js inlines only `NEXT_PUBLIC_*` variables into the browser bundle at build
time. Server-side reads (notification dispatch, the API's TOTP enrollment) see
the un-prefixed `BRANDING_*`; client-side reads need the `NEXT_PUBLIC_`
duplicate. The [resolver](../../../packages/branding/src/index.ts) tries both, so
setting `BRANDING_APP_NAME` in the api `.env` **and** a matching
`NEXT_PUBLIC_BRANDING_APP_NAME` in the web `.env` keeps the two runtime surfaces
in sync. Every field is optional ; an unset var falls through to the neutral
default. See `services/api/.env.example` and `services/web/.env.example` for the
full list with inline notes.

The resolver spells every variable out as a **literal** `process.env.X` access
for that reason. Next's inlining is a static text substitution over literal
member expressions ; a computed `process.env[key]` lookup is invisible to it and
survives into the bundle as a read against a `process` shim that carries
nothing : which silently returns the neutral default for every field in the
browser. If you add a branding field, add its literal pair to `ENV_CANDIDATES`
rather than deriving the key name.

**Do not edit the defaults** in `packages/branding/src/index.ts` to hardcode a
business : keeping them generic is what makes the app reusable. Set the env vars
instead.

### i18n stays product-agnostic

The message catalogs (`services/web/src/messages/{en,fr}.json`) never spell out a
product name. They carry the literal tokens `{appName}`, `{tagline}`, and
`{supportEmail}`, which
[`i18n/request.ts`](../../../services/web/src/i18n/request.ts) substitutes from
`BRANDING` on every request (a static pass before next-intl sees the strings).
Add a brand token to a new string the same way ; write `{appName}` in the
catalog, never the literal name.
