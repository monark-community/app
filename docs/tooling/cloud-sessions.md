# Isolated cloud coding sessions (phone-friendly)

Each unit of work — one bugfix / feature / hotfix — runs as its own **Claude
Code cloud session**: a fresh, isolated Anthropic-managed VM with the repo
cloned on its own branch, backed by its own **ephemeral Neon Postgres branch**.
Nothing is shared between sessions, so there's no cross-contamination and no
"which branch am I on" confusion. New work is always a new session.

This replaces the "several sessions pointed at one local folder" setup (that was
Remote Control into a single working directory — no isolation).

## How it fits together

| Concern                                  | Handled by                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Isolation (fresh VM + clone per session) | Claude Code on the web (cloud sessions)                                                                                 |
| Slow, cacheable setup (pnpm, tools)      | **Setup Script** — [`.claude/hooks/cloud-setup.sh`](../../.claude/hooks/cloud-setup.sh), pasted into the environment UI |
| Per-session DB + migrations + scope      | **SessionStart hook** — [`.claude/hooks/session-start.sh`](../../.claude/hooks/session-start.sh)                        |
| Throwaway database                       | An ephemeral **Neon branch** per session, forked from a seeded golden branch                                            |
| Staying on task                          | The scope protocol the hook injects + [`SCOPE.template.md`](./SCOPE.template.md)                                        |
| Git workflow                             | Cloud session works on a branch, pushes, opens a PR                                                                     |

## One-time setup

1. **Neon project.** Create a Neon project. On its `main` branch, apply the
   schema once so every session branch forks from a ready database:

   ```bash
   DIRECT_URL=<neon main direct url> DATABASE_URL=<neon main url> \
     pnpm --filter @monark/db exec prisma migrate deploy
   # (+ any seed you rely on)
   ```

   This `main` is the **golden parent** — session branches are instant copies of it.

2. **Cloud environment (claude.ai/code → your environment):**
   - **Setup Script:** paste the contents of [`.claude/hooks/cloud-setup.sh`](../../.claude/hooks/cloud-setup.sh).
   - **Environment variables** (`.env` format):
     ```
     NEON_API_KEY=<neon api key>
     NEON_PROJECT_ID=<neon project id>
     NEON_PARENT_BRANCH=main
     # + any app secrets the server needs (auth signing keys, etc.)
     ```
     Note: env vars are visible to anyone who can edit this environment; use a
     Neon API key scoped to this project, and rotate it periodically.

3. **Merge this branch** so `.claude/` and the docs are on the branch your cloud
   sessions clone (the hook only _acts_ in the cloud, so it's inert locally).

## Per-session flow (from your phone)

1. Open **claude.ai/code** (the Code section of the Claude app / a home-screen
   PWA). Start a new session on this repo and type the task — e.g.
   _"feature: add CSV export to the projects table; don't touch the API."_
2. On startup the hook provisions a Neon branch named `cc-<git-branch>`, points
   `DATABASE_URL` / `DIRECT_URL` at it, runs `prisma migrate deploy`, and prints
   the scope protocol.
3. Claude confirms scope, writes `SCOPE.md`, and works within it.
4. When done it opens a PR and stops. You review / merge from the phone.
5. Next task → new session. (There is no literal one-tap-to-cloud button today;
   it's a few taps in the app — but zero SSH, zero terminal.)

## Teardown of ephemeral DB branches

There is **no reliable session-end hook** — a reclaimed cloud VM fires nothing —
so branches can't be deleted at the end. Two safety nets:

- **Prune-on-start:** the hook sweeps `cc-*` Neon branches older than 24h each
  time it runs.
- **Recommended:** delete the branch when its PR closes, via a GitHub Action:
  ```yaml
  # .github/workflows/neon-cleanup.yml (sketch)
  on: { pull_request: { types: [closed] } }
  jobs:
    drop:
      runs-on: ubuntu-latest
      steps:
        - run: npx neonctl branches delete "cc-${{ github.head_ref }}" --project-id "$NEON_PROJECT_ID"
          env: { NEON_API_KEY: ${{ secrets.NEON_API_KEY }}, NEON_PROJECT_ID: ${{ secrets.NEON_PROJECT_ID }} }
  ```

## Honest caveats

- **Scope enforcement is a strong nudge, not a hard gate.** Hooks can't force
  Claude's first message; the protocol is injected context + `SCOPE.md`.
- **Billing:** cloud sessions share your plan's rate limits (no VM charge).
  Running several in parallel consumes them proportionally; Max is comfortable.
- **App vs raw Postgres:** this assumes the app only needs Postgres (Prisma), not
  a running Supabase Auth/Storage/Realtime. If a code path needs those services,
  a bare Neon branch won't provide them — that path would need the local Supabase
  stack in-VM instead (heavier; see the cached-local-in-sandbox alternative).
- **Migrations use `DIRECT_URL`** (Neon direct connection); the app uses the
  pooled `DATABASE_URL`. Both are set by the hook.
