---
type: runbook
---

# Maintain the CI pipeline

The routine operations on the repository's GitHub Actions: run the checks locally, run the end-to-end suite, add a job, set a coverage floor, and connect the docs site. Each takes a few minutes. Every job and trigger is listed in [CI jobs](../reference/ci-jobs.md).

## Before you start

- [ ] A local checkout with `pnpm install` done
- [ ] Write access to the repository; admin access for the secrets in the last section

## Run the CI checks locally

1. Run the gate CI enforces, in the same order:
   ```sh
   pnpm agent gate
   ```
   It stops at the first failure.
2. If you changed tested code, also run the integration suites and the coverage merge, which the gate doesn't cover:
   ```sh
   pnpm test:integration:coverage && pnpm test:coverage && pnpm coverage:merge
   ```

The one thing you can't reproduce exactly is CI's merged coverage, because CI computes it from a clean checkout.

## Run the end-to-end suite

The Playwright suite boots Supabase, the api and the web app, and takes about 20 minutes, so it runs only on demand.

1. Open **Actions → E2E → Run workflow**, pick the branch, and run it.
2. If it fails, download the Playwright report artifact from the run.

Locally, `pnpm test:e2e` runs the same suite against your running stack.

## Add a CI job

1. Add the job to `.github/workflows/ci.yml`.
2. Add its name to the `needs:` list of the `ci-ok` job.
3. Leave branch protection alone. `ci-ok` is the only required check; a second required check would block every open pull request whose branch predates the new job, because those runs never report it.

Verify: on your pull request, `ci-ok` waits for the new job and fails if it fails.

## Set a coverage floor for a new package

Every package that produces coverage needs a floor, or `coverage-upload` fails with "produced coverage but has no THRESHOLDS entry".

1. Run the tests with coverage, then ask for suggested floors:
   ```sh
   pnpm test:coverage && pnpm test:integration:coverage && pnpm coverage:suggest
   ```
2. Add an entry for the package to `THRESHOLDS` in `tools/merge-coverage.ts`, with `lines`, `statements`, `functions` and `branches` a few points below the measured values, rounded down to a multiple of 5.
3. Run `pnpm coverage:merge`. It passes when every package meets its floor.

Raise a floor when new tests justify it. Lower one only deliberately, with a comment saying why.

## Connect the docs site

Merges to `develop` that touch published docs ask `monark-community/app-docs` to sync within a minute. Without this the site still syncs daily.

1. Create a GitHub App with **Contents: read and write**, and install it on both this repository and `monark-community/app-docs`.
2. In this repository, add the Actions secrets `DOCS_SYNC_APP_CLIENT_ID` and `DOCS_SYNC_APP_PRIVATE_KEY`.

Verify: after the next docs merge, the **Notify docs site** run logs "Asked app-docs to sync from develop."

## If something goes wrong

| Symptom                                  | Cause                                                         | Fix                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `repo-checks` fails on codegen drift     | a generated file wasn't regenerated                           | Run `pnpm gen` and commit the result.                                                                   |
| `migration-drift` fails                  | schema changed without a migration, or a migration was edited | Create the migration as in [Change the database schema](../build/extend/change-the-database-schema.md). |
| A pull request waits forever for a check | a second required check was added to branch protection        | Remove it; keep only `ci-ok`.                                                                           |
| `coverage-upload` fails below a floor    | coverage dropped                                              | Add tests, or lower the floor deliberately with a comment.                                              |
| **Notify docs site** logs "skipping"     | the App secrets are missing                                   | Add them as above.                                                                                      |
