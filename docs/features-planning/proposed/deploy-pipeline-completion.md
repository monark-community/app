# Deployment ; finishing the deploy-on-green pipeline

## Context

Most of the continuous-delivery story shipped on `2026-09-08`. What exists:

- **Two environments mapped to branches** ; `develop` to staging, `main` to production, with
  separate Supabase projects, documented in
  [environments](../../technical-documentation/environments/_index.md).
- **`deploy-api.yml`** ; keys on `workflow_run` for CI, deploys the Render services only when
  `conclusion == success`, resolves services **by name** from
  [`render.yaml`](../../../render.yaml) (one secret, `RENDER_API_KEY`), and polls each deploy to a
  terminal state so the check reflects the real outcome. No-ops with a notice when the secret is
  absent.
- **Migrations** run as each api service's `preDeployCommand` (`prisma migrate deploy`), so a
  deploy carries its own schema change.
- **`tools/preflight`** ; a configuration gate that refuses to launch a misconfigured app and
  serves the checklist on the port instead, with `GET /preflight.json` for pipelines.
- **One required check**, `ci-ok`, that every CI leg fans into.
- **Migration verification in CI** ; `pnpm check:migrations`
  ([`tools/check-migrations.ts`](../../../tools/check-migrations.ts)) replays every committed
  migration into a shadow database and diffs the result against `schema.prisma`, while the
  testcontainer suites prove they apply. Both run as CI legs.
- **`notify-docs.yml`** ; publishes documentation changes to the docs site.

Three gaps remain, and the first is actively harmful:

1. **Everything deploys twice.** Every service in `render.yaml` still carries `autoDeploy: true`,
   so Render's own push trigger fires _and_ `deploy-api.yml` fires. The workflow's own
   documentation says to flip these to `false` and re-sync the blueprint once it is wired up; that
   step was never done. Today a merge deploys immediately on push (ungated) and then again on
   green.
2. **The web is not gated at all.** Vercel deploys `develop` and `main` through its git
   integration, on push. So a red CI still ships the frontend, and the two halves of one merge can
   deploy in either order.
3. **Nothing verifies a deploy worked.** The Render poll confirms the deploy reached a terminal
   state, not that the app answers. There is no post-deploy smoke check and no documented rollback.

## Goals

- **One deploy per merge, gated on green**, for both halves.
- **A post-deploy smoke check** whose failure is visible on the commit.
- **A written rollback path** for each half, including the migration question.

## Non-goals

- **Per-PR preview environments** with ephemeral databases. Attempted once
  ([PR #34](https://github.com/monark-community/app/pull/34), closed unmerged) ; a real staging
  environment covers the need at far lower cost. Revisit only if concurrent branch verification
  becomes the bottleneck.
- **Blue/green or canary.** Overkill for a single-tenant product at this stage.
- **Multi-instance orchestration**, which has [its own document](../../technical-documentation/multi-instance/_index.md).

## Work

### 1. Stop deploying twice

Flip `autoDeploy: false` on all six services in [`render.yaml`](../../../render.yaml) (api and the
crons, both environments) and **re-sync the blueprint**, which is the step that actually takes
effect ; a dashboard value overrides the blueprint until then. `deploy-api.yml` becomes the only
deploy path, which is also what makes the "backend didn't follow a merge" diagnosis in
[environments](../../technical-documentation/environments/_index.md) collapse from four causes to
one.

This is a config change with a blueprint sync and a verified staging deploy, and it should land
before anything else here.

### 2. Gate the web on green

Turn off Vercel's git auto-deploy for `main` and `develop` (`git.deploymentEnabled` in
`vercel.json`, or the dashboard's ignored-build-step), and add a `deploy-web` job to the same
`workflow_run` workflow that deploys the api, triggering Vercel through a **Deploy Hook** per
environment. Two secrets, `VERCEL_DEPLOY_HOOK_STAGING` and `VERCEL_DEPLOY_HOOK_PRODUCTION`, and the
same no-op-with-a-notice behaviour when they are absent, so a fork never sees a red X for a deploy
it was never going to run.

Ordering: deploy the api first and the web after it reports success, since the api carries the
migration and the web is the client. Sequential, not parallel, and stated in the workflow.

### 3. Smoke-check the deploy

After both halves report success, hit a small set of endpoints against the environment that was
just deployed and fail the check if any is wrong:

- `GET <api>/health` ; already exists (the dev overlay's api-health panel uses it).
- `GET <api>/preflight.json` ; the preflight tool already speaks this, so the same checks that gate
  a local start also assert a deployed environment is configured.
- `GET <web>/signin` ; a 200 with the brand wordmark present, which catches a broken build that
  still deploys.

Nothing authenticated, nothing that writes. The point is to catch "deployed and broken", not to
replace e2e, which already runs in CI against a local stack.

### 4. Rollback, written down

A runbook page under [environments](../../technical-documentation/environments/_index.md):

- **Web** ; Vercel instant rollback to the previous deployment. Safe, always.
- **API** ; redeploy the previous commit through `deploy-api.yml`'s `workflow_dispatch`.
- **Migrations** ; the hard part. A rollback of code past a migration boundary is only safe when
  the migration was additive. State the rule (expand/contract: add columns, backfill, switch reads,
  drop in a later release, never in the same one) and note which recent migrations were destructive.
  A "roll forward with a fix" default is the honest recommendation ; say so rather than implying a
  down-migration exists.

## Dependencies

Shipped: `deploy-api.yml`, `ci-ok`, `tools/preflight`, `check:migrations`, the health endpoint, the
testcontainer setup.

## Edge cases and risks

- **The blueprint re-sync.** Re-syncing re-reads every `sync: false` env var's _presence_, not its
  value, but a mistake here takes down staging. Do staging first, verify, then production.
- **Deploy hooks carry no commit.** A Vercel deploy hook builds the branch head, which may have
  moved since the CI run that triggered it. Low risk on a low-traffic branch; the smoke check
  catches the bad case. Pinning needs the Vercel CLI with an explicit ref, which is a heavier
  integration and is the upgrade path if this bites.
- **Two `workflow_run` triggers racing.** Two merges in quick succession can deploy out of order.
  Use a concurrency group per environment with `cancel-in-progress: false`, so deploys queue rather
  than interleave.
- **Secrets absent in forks.** Every job already no-ops with a notice; keep that property for the
  new ones.

## Success metrics

- One deploy per merge, per half, each gated on `ci-ok`.
- A failed deploy or a broken deployed environment shows as a failed check on the commit.
- Rollback is a documented, followed procedure rather than a decision made under pressure.

## Out of scope

- Per-PR preview environments (see Non-goals).
- Deploy notifications to chat ; a webhook subscription on the workflow, once someone wants it.
- Automated promotion `develop` to `main` ; promotion stays a human decision, per
  [CLAUDE.md](../../../CLAUDE.md).
