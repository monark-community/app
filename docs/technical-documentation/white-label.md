# White-label the app

This repository is a **white-label starter**. The application code carries no
business's identity ; the shipped defaults are neutral placeholders (app name
`App`, a blue accent, a generic tagline, an `example.com` support inbox). A real
deployment : Monark's own included ; layers its identity on top via environment
variables. Retargeting the app for another business is a configuration change,
not a code change.

Two things are deliberately **not** white-labeled, because they are internal
identifiers rather than user-facing brand:

- Package names (`@monark/*`) and the `@monark/ui` component library.
- The Data Model query language, **MonarkQL / MQL**.
- Stable API identifiers: the `mrk_` API-key prefix and the `monark_*` MCP tool
  names. Renaming these would break every existing integration. The
  human-readable parts around them ; the OpenAPI document's title and
  description, the MCP tool descriptions ; do follow `BRANDING.appName`.

These never surface to an end user, so they stay stable across deployments.

## The branding seam

Everything user-visible that names or colors the product flows through one
module: [`@monark/branding`](../../packages/branding/src/index.ts). It exposes a
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
duplicate. The [resolver](../../packages/branding/src/index.ts) tries both, so
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
[`i18n/request.ts`](../../services/web/src/i18n/request.ts) substitutes from
`BRANDING` on every request (a static pass before next-intl sees the strings).
Add a brand token to a new string the same way ; write `{appName}` in the
catalog, never the literal name.

## Retargeting checklist

1. **Set the `BRANDING_*` env vars** for your product on the api service, and the
   `NEXT_PUBLIC_BRANDING_*` duplicates on the web service (see the table above).
   **Quote any hex value** ; an unquoted leading `#` is read as a comment by
   Node's `--env-file` parser and silently resolves to an empty string.
2. **Upload the org logo.** For a single-tenant deploy this is the logo that
   actually renders: `/admin/organizations/<id>` → Organization profile. It takes
   a **square JPEG, PNG or WebP** (max 2 MB) (not SVG) and is stored per-org, so
   it also reaches the emails the app itself sends.
   `BRANDING_LOGO_SRC` is the fallback for surfaces rendered before an org logo
   exists (multi-tenant, or a fresh deploy) ; point it at a file you drop into
   `services/web/public/`.
3. **Replace the favicon.** `services/web/src/app/favicon.ico` ships as a neutral
   placeholder generated from `public/logo.svg`. There is no env var for it ;
   Next serves the file as-is, so swap the file. (Monark's own assets are kept
   at `services/web/public/monark-favicon.ico` and `monark-logo.svg` for that
   deployment to restore ; a fork deletes them.)
4. **Brand the three auth emails.** Signup confirmation, password reset and email
   change are rendered by **Supabase**, not by `@monark/notifications`, so they
   cannot read `BRANDING`. They ship brand-neutral. See "Auth emails" below.
5. **Pick the TOTP issuer before launch.** It is what users see in their
   authenticator app next to their account label ; changing it later forces every
   user to re-enroll.
6. **Provision the organization** (single-tenant deploys). See below.

## Theming: two sources, one token set

Brand color arrives from two places, and they feed **the same token set** ;
`--primary`, `--primary-foreground`, `--ring`, `--sidebar-primary`,
`--sidebar-ring`, `--chart-1`, `--brand-primary`, `--brand-accent`,
`--brand-foreground`, set on `<html>` by
[the root layout](../../services/web/src/app/layout.tsx):

- **The singleton organization's `primaryColor`** (runtime : set in-app, or at
  provisioning via `INITIAL_ORG_PRIMARY_COLOR`) wins when it is set.
- **`BRANDING_PRIMARY`** (deploy time, via env) is used when it isn't. This is
  what themes a multi-tenant deploy, and a single-tenant one before its org is
  provisioned.

Either way the foreground painted on top is computed from WCAG relative
luminance, so a light or pastel brand color still yields legible buttons.
`BRANDING_ACCENT` is the second stop of the gradient surfaces ; when you don't
set one, the org color stands in for both stops rather than pairing your brand
with an unrelated placeholder.

The values in
[`globals.css`](../../services/web/src/app/globals.css) are the neutral fallback
for surfaces rendered outside that layout (the component screenshot harness, for
instance) : the app itself always gets the tokens above.

**Emails are separate.** `@monark/notifications` deliberately ignores
`brandPrimary` and defaults to black, because a mid-saturation brand color reads
poorly on an email's white card. The singleton org's `primaryColor` (and its
uploaded logo) DO reach app-sent email ; see
[`enrich.ts`](../../packages/notifications/src/server/enrich.ts).

## Auth emails (Supabase-rendered)

Three emails do not come from the app at all ; signup confirmation, password
reset, and email change are rendered by **Supabase Auth** from
[`supabase/templates/`](../../supabase/templates), with their subjects in
[`supabase/config.toml`](../../supabase/config.toml). Supabase renders these
server-side and cannot reach `@monark/branding`, so **there is no env seam
here**.

They ship brand-neutral: no product name, a `#18181b` accent, and no wordmark.
Each carries a commented-out insertion point showing where to put yours. To
brand them:

1. Fill the wordmark insertion point in all three templates (prefer **text** ;
   Outlook desktop and parts of Gmail don't render SVG, and most clients block
   remote images by default).
2. Swap the `#18181b` accent for your brand color ; and keep the CTA label
   readable against it.
3. Set the three `subject` lines in `supabase/config.toml`.

These are the first emails a new user ever receives, which is why the default is
neutral rather than any one business's identity.

The pre-auth screens (signin, signup, the TOTP challenge, password reset) sit
across both layers: the logo resolves through the singleton org, while the
animated gradient backdrop behind them paints from `--primary` ; the org color
when one is set, the starter orange otherwise. Nothing to configure separately ;
set the org color and the sign-in screen follows.

## Provisioning the organization

Single-tenant deploys need exactly one organization. There is no in-app setup
page ; provisioning is operator-driven:

- **At api boot** : when the `tenancy.multi-tenant` flag is OFF (default) and
  zero organizations exist, the API reads `INITIAL_ORG_SLUG` / `INITIAL_ORG_NAME`
  / `INITIAL_ORG_PRIMARY_COLOR` and provisions the singleton. Idempotent ; a
  restart on a healthy install is a no-op.
- **Manually, without a restart** : `pnpm provision:org` (see
  [`tools/provision-org.ts`](../../tools/provision-org.ts)). It reads the same
  `INITIAL_ORG_*` env vars, or accepts `--slug` / `--name` / `--color` flags, and
  is likewise idempotent. Needs `DATABASE_URL`.

Multi-tenant deploys leave the `INITIAL_ORG_*` vars unset and create
organizations through the app.

## What stays with the deployment, not the code

Operator-owned deployment config legitimately carries the operator's identity and
is **not** part of the white-label surface:

- `render.yaml` service names (`monark-api`, etc.) ; renaming them re-creates
  services on the next Render blueprint sync, so a fork picks its own names.
- CI workflow env in `.github/workflows/*` (`INITIAL_ORG_NAME`, `SMTP_FROM`) :
  throwaway values for the test run.

A different business forks the repo and owns these files ; the app code they
build on top stays generic.
