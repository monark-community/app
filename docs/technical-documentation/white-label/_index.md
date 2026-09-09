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

## In this section

- **[The branding seam](the-branding-seam.md)**
- **[Retargeting checklist](retargeting-checklist.md)**
- **[Theming: two sources, one token set](theming-two-sources-one-token-set.md)**
- **[Auth emails (Supabase-rendered)](auth-emails-supabase-rendered.md)**

## Provisioning the organization

The app needs exactly one organization. There is no in-app setup
page ; provisioning is operator-driven:

- **At api boot** : when zero organizations exist, the API reads
  `INITIAL_ORG_SLUG` / `INITIAL_ORG_NAME`
  / `INITIAL_ORG_PRIMARY_COLOR` and provisions the singleton. Idempotent ; a
  restart on a healthy install is a no-op.
- **Manually, without a restart** : `pnpm provision:org` (see
  [`tools/provision-org.ts`](../../../tools/provision-org.ts)). It reads the same
  `INITIAL_ORG_*` env vars, or accepts `--slug` / `--name` / `--color` flags, and
  is likewise idempotent. Needs `DATABASE_URL`.

## What stays with the deployment, not the code

Operator-owned deployment config legitimately carries the operator's identity and
is **not** part of the white-label surface:

- `render.yaml` service names (`monark-api`, etc.) ; renaming them re-creates
  services on the next Render blueprint sync, so a fork picks its own names.
- CI workflow env in `.github/workflows/*` (`INITIAL_ORG_NAME`, `SMTP_FROM`) :
  throwaway values for the test run.

A different business forks the repo and owns these files ; the app code they
build on top stays generic.
