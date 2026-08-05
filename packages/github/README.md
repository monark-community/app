# @monark/github

**Extended module.** A GitHub integration built on top of the core `@monark/automation` engine: it adds GitHub **trigger events** (an issue opened, a PR merged, a push, …) that fire your automations, and GitHub **action nodes** (create issue, comment, add labels, open PR, request review, search, …) that read from and write to GitHub inside a flow. Flag-gated (`github.enabled`, default off).

**Status:** MVP shipped end-to-end — inbound webhook → domain events → automation triggers, plus 11 action nodes calling the GitHub REST API. Auth is a **token stored in the secrets substrate** (a fine-grained PAT); a GitHub App is a future upgrade that wouldn't change the nodes.

## What's here

- **`/contracts`** — the seven `github.*` [domain events](src/contracts/events.ts) (flat, shallow payloads with `organizationId` + `repo`) and connection constants ([github.ts](src/contracts/github.ts): the webhook-secret key, `parseRepoRef`).
- **`/server`**
  - [webhook.ts](src/server/webhook.ts) — `handleGithubWebhook`: verifies GitHub's `X-Hub-Signature-256` HMAC against the org's stored webhook secret, maps a delivery to a `github.*` event, and `emit()`s it. `mapGithubEvent` is the pure translation.
  - [nodes/](src/server/nodes) — the action nodes, registered under the `github` namespace via `registerAutomationNodes`. Each reads its token from the run's secret store (`ctx.getSecret`) and calls GitHub through [client.ts](src/server/client.ts) (`githubRequest`, over the shared SSRF-guarded `safeFetch`).
  - [event-types.ts](src/server/event-types.ts) / [permissions.ts](src/server/permissions.ts) / [feature-flags.ts](src/server/feature-flags.ts) — boot-time registrations.
  - [router.ts](src/server/router.ts) — `githubRouter.connection`: status / generate-webhook-secret / disconnect.
- **`/client`** — reserved for the `/github` settings surface.

## Key concepts

**Triggers ride the event bus.** GitHub → `POST /hooks/github/:org` → verify signature → `emit` a `github.*` event carrying `organizationId`. The automation subscriber already fires any enabled automation whose trigger matches an emitted event type, so no automation-side code is needed — the event just has to exist (declared in `contracts/events.ts`, registered with `registerEventTypes`). Unmodeled deliveries are acked `202` so GitHub doesn't retry.

**Actions reuse the automation node contract.** A node is a normal `defineNode` — descriptor + `configSchema` + `execute`. Its `token` field is a `secret` (the operator picks which stored secret holds the PAT); `execute` resolves it with `ctx.getSecret` and calls GitHub. Declared `outputFields` flow into the editor's variable picker.

**No new tables.** The only per-org state is the inbound **webhook signing secret**, kept in the `@monark/secrets` substrate under `github.webhook-secret` (write-only; decrypted server-side only to verify a delivery). "Connected" == that secret exists. The GitHub token nodes call with is likewise an org secret referenced by name.

## Public API

| Export                                                                                                       | From         | Purpose                                                        |
| ------------------------------------------------------------------------------------------------------------ | ------------ | -------------------------------------------------------------- |
| `registerGithubEventTypes` / `registerGithubFeatureFlags` / `registerGithubPermissions`                      | `/server`    | Boot-time registrations.                                       |
| `registerGithubAutomationNodes`                                                                              | `/server`    | Register the GitHub action nodes with the automation registry. |
| `handleGithubWebhook` / `mapGithubEvent`                                                                     | `/server`    | Inbound webhook verification + delivery→event mapping.         |
| `githubRouter`                                                                                               | `/server`    | The `github.connection.*` tRPC surface.                        |
| `GithubEvents` and the per-event types / `GITHUB_EVENT_TYPES` / `parseRepoRef` / `GITHUB_WEBHOOK_SECRET_KEY` | `/contracts` | The event union + connection constants.                        |

## Data model

None owned. Per-org config lives in the `@monark/secrets` substrate (`github.webhook-secret`) — no Prisma fragment, no migration.

## Events emitted / consumed

**Emitted** (from inbound webhooks, subscribable + usable as automation triggers): `github.issue-opened`, `github.issue-commented`, `github.pull-request-opened`, `github.pull-request-merged`, `github.pull-request-review-submitted`, `github.push`, `github.release-published`. **Consumed:** none.

## tRPC surface

`github.connection.status` (query), `github.connection.generateWebhookSecret` (mutation, returns the secret once), `github.connection.disconnect` (mutation) — all gated by `github.manage`.
