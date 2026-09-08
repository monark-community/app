# 1.1 Connect the GitHub repo to Render

[render.com](https://render.com) → New → Blueprint. Pick this repo.

Render reads [`render.yaml`](../../../../render.yaml) at the repo root, which defines **both** environments ; production services on `branch: main` and mirror `*-staging` services on `branch: develop`. It lists six services + two env-var groups :

- **Production** (`main`) : `monark-api`, `monark-cron-deletions`, `monark-cron-webhook-sweep`, and the `monark-cron-shared` group.
- **Staging** (`develop`) : `monark-api-staging`, `monark-cron-deletions-staging`, `monark-cron-webhook-sweep-staging`, and the `monark-cron-shared-staging` group.

For this production walkthrough, fill only the **production** services + `monark-cron-shared` below ; leave the `*-staging` ones for when you stand up staging (see [environments.md](../../environments/_index.md)). Don't click "Apply" yet ; open the env-var prompts first.
