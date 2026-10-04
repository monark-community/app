---
type: runbook
---

# Deploy the api only after CI passes

Make Render deploy a commit only when CI is green, and make each deploy's outcome a check on the commit. By default Render deploys on every push to `main` or `develop`, even one that breaks the build. About 10 minutes; it changes how every api and cron service deploys.

The `deploy-api.yml` workflow does this. When the `CI` workflow succeeds on `main` or `develop`, it deploys `monark-api`, `monark-cron-deletions` and `monark-cron-webhook-sweep` (with `-staging` for `develop`) through the Render API, the api first, and waits for each to go live. Without its secret it does nothing.

## Before you start

- [ ] Admin access to the GitHub repository's settings
- [ ] Render services created from the blueprint, keeping the names in `render.yaml`

## Steps

1. In Render, open **Account Settings → API Keys** and create a key.
2. In GitHub, open **Settings → Secrets and variables → Actions** and add a repository secret named `RENDER_API_KEY` with that key.
3. In `render.yaml`, set `autoDeploy: false` on all six services, merge the change, and let Render sync the blueprint. Otherwise every push deploys twice: once from Render, once from the workflow.

## Verify

Merge a change to `develop`. After `CI` passes, the **Deploy api** workflow runs, and its summary lists each staging service as `live`.

To redeploy without a code change (for example after fixing an environment variable), open **Actions → Deploy api → Run workflow** and choose `staging` or `production`.

## If something goes wrong

| Symptom                                              | Cause                                                                                                                                                | Fix                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Workflow passes with "RENDER_API_KEY is not set"     | secret missing or misnamed                                                                                                                           | Add it exactly as `RENDER_API_KEY`.                                                          |
| Summary says a service is "not found on Render"      | service renamed or created by hand                                                                                                                   | Use the blueprint's names, or create the services from the blueprint.                        |
| A service shows `pre_deploy_failed`                  | `prisma migrate deploy` failed                                                                                                                       | Read the Render deploy log; fix the database or migration, then rerun.                       |
| Times out after 20 minutes                           | the deploy hung on Render                                                                                                                            | Check the Render dashboard, then rerun from **Run workflow**.                                |
| Without the workflow, the api doesn't follow a merge | services not blueprint-managed, **Auto-Deploy** off in the dashboard, the Render GitHub connection lapsed, or the push wasn't to `main` or `develop` | Check each in that order under the service's **Settings** and **Account Settings → GitHub**. |

Next: [Set up social sign-in](set-up-social-sign-in.md)
