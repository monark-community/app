# White-label the app

This repository is a **white-label starter**. The application code carries no
business's identity ; the shipped defaults are neutral placeholders (app name
`App`, a blue accent, a generic tagline, an `example.com` support inbox). A real
deployment — Monark's own included — layers its identity on top via environment
variables. Retargeting the app for another business is a configuration change,
not a code change.

Two things are deliberately **not** white-labeled, because they are internal
identifiers rather than user-facing brand:

- Package names (`@monark/*`) and the `@monark/ui` component library.
- The Data Model query language, **MonarkQL / MQL**.

These never surface to an end user, so they stay stable across deployments.

## The branding seam

Everything user-visible that names or colors the product flows through one
module: [`@monark/branding`](../../packages/branding/src/index.ts). It exposes a
single typed `BRANDING` object, imported by both server and client code, so a
brand change lands everywhere — i18n copy, email templates, the TOTP issuer, the
SMTP envelope, the NProgress bar, the in-app logo — without a cross-codebase
grep-replace.

| Field          | Env var (server / client)                                       | Feeds                                               |
| -------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| `appName`      | `BRANDING_APP_NAME` / `NEXT_PUBLIC_BRANDING_APP_NAME`           | `{appName}` in i18n, page titles, app bar wordmark  |
| `tagline`      | `BRANDING_TAGLINE` / `NEXT_PUBLIC_BRANDING_TAGLINE`             | `{tagline}` in i18n, `<meta description>`, sign-in  |
| `supportEmail` | `BRANDING_SUPPORT_EMAIL` / `NEXT_PUBLIC_BRANDING_SUPPORT_EMAIL` | `{supportEmail}` in i18n, code-of-conduct           |
| `totpIssuer`   | `BRANDING_TOTP_ISSUER`                                          | Name shown in the user's authenticator app          |
| `fromEmail`    | `BRANDING_FROM_EMAIL`                                           | Outbound mail envelope (unless `SMTP_FROM` is set)  |
| `appUrl`       | `APP_URL`                                                       | Links built inside emails                           |
| `brandPrimary` | `BRANDING_PRIMARY` / `NEXT_PUBLIC_BRANDING_PRIMARY`             | Email CTA buttons, NProgress edge, wordmark         |
| `brandAccent`  | `BRANDING_ACCENT` / `NEXT_PUBLIC_BRANDING_ACCENT`               | NProgress gradient, decorative accents              |
| `logoSrc`      | `BRANDING_LOGO_SRC` / `NEXT_PUBLIC_BRANDING_LOGO_SRC`           | The in-app logo (path under `services/web/public/`) |

### Why two env vars per field

Next.js inlines only `NEXT_PUBLIC_*` variables into the browser bundle at build
time. Server-side reads (notification dispatch, the API's TOTP enrollment) see
the un-prefixed `BRANDING_*`; client-side reads (NProgress color, the app-bar
wordmark) need the `NEXT_PUBLIC_` duplicate. The
[resolver](../../packages/branding/src/index.ts) tries both, so setting
`BRANDING_APP_NAME` in the api `.env` **and** a matching
`NEXT_PUBLIC_BRANDING_APP_NAME` in the web `.env` keeps the two runtime surfaces
in sync. Every field is optional ; an unset var falls through to the neutral
default. See `services/api/.env.example` and `services/web/.env.example` for the
full list with inline notes.

**Do not edit the defaults** in `packages/branding/src/index.ts` to hardcode a
business — keeping them generic is what makes the app reusable. Set the env vars
instead.

### i18n stays product-agnostic

The message catalogs (`services/web/src/messages/{en,fr}.json`) never spell out a
product name. They carry the literal tokens `{appName}`, `{tagline}`, and
`{supportEmail}`, which
[`i18n/request.ts`](../../services/web/src/i18n/request.ts) substitutes from
`BRANDING` on every request (a static pass before next-intl sees the strings).
Add a brand token to a new string the same way — write `{appName}` in the
catalog, never the literal name.

## Retargeting checklist

1. **Set the `BRANDING_*` env vars** for your product on the api service, and the
   `NEXT_PUBLIC_BRANDING_*` duplicates on the web service (see the table above).
2. **Replace the logo.** Drop your SVG into `services/web/public/` and point
   `BRANDING_LOGO_SRC` at it (e.g. `/logo.svg`). Replace
   `services/web/src/app/favicon.ico` with yours.
3. **Pick the TOTP issuer before launch.** It is what users see in their
   authenticator app next to their account label ; changing it later forces every
   user to re-enroll.
4. **Provision the organization** (single-tenant deploys). See below.

## Theming: two layers

Brand color arrives from two independent places, and they stack:

- **`brandPrimary` / `brandAccent`** (build/deploy time, via env) drive surfaces
  that render outside the running app or before an org is known — the NProgress
  bar, every email CTA button, the TOTP/security accent, the wordmark.
- **The singleton organization's `primaryColor`** (runtime, set in-app or at
  provisioning) themes the whole live UI on top of the branding colors. A
  single-tenant deploy typically sets both — the org color drives day-to-day UI,
  the branding colors cover the pre-auth and email surfaces.

The pre-auth screens (signin, signup, the TOTP challenge, password reset) sit
across both layers: the logo resolves through the singleton org, while the
animated gradient backdrop behind them paints from `--primary` — the org color
when one is set, the starter orange otherwise. Nothing to configure separately ;
set the org color and the sign-in screen follows.

## Provisioning the organization

Single-tenant deploys need exactly one organization. There is no in-app setup
page ; provisioning is operator-driven:

- **At api boot** — when the `tenancy.multi-tenant` flag is OFF (default) and
  zero organizations exist, the API reads `INITIAL_ORG_SLUG` / `INITIAL_ORG_NAME`
  / `INITIAL_ORG_PRIMARY_COLOR` and provisions the singleton. Idempotent ; a
  restart on a healthy install is a no-op.
- **Manually, without a restart** — `pnpm provision:org` (see
  [`tools/provision-org.ts`](../../tools/provision-org.ts)). It reads the same
  `INITIAL_ORG_*` env vars, or accepts `--slug` / `--name` / `--color` flags, and
  is likewise idempotent. Needs `DATABASE_URL`.

Multi-tenant deploys leave the `INITIAL_ORG_*` vars unset and create
organizations through the app.

## What stays with the deployment, not the code

Operator-owned deployment config legitimately carries the operator's identity and
is **not** part of the white-label surface:

- `render.yaml` service names (`monark-api`, etc.) — renaming them re-creates
  services on the next Render blueprint sync, so a fork picks its own names.
- CI workflow env in `.github/workflows/*` (`INITIAL_ORG_NAME`, `SMTP_FROM`) —
  throwaway values for the test run.

A different business forks the repo and owns these files ; the app code they
build on top stays generic.
