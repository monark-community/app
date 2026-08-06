# @monark/discord

**Extended module — an _automation integration_** (`integrates: "@monark/automation"`; `check:tiers` enforces the dependency). Adds Discord **action nodes** that let an automation write to Discord — send a message, react, edit, read a channel. Flag-gated (`discord.enabled`, default off).

**Write-only MVP, on purpose.** Unlike GitHub, Discord has **no inbound event webhooks** — real-time events (a new message, a reaction) arrive over a persistent **Gateway WebSocket** a bot holds open, and the only inbound HTTP is Ed25519-signed slash-command Interactions. Both are a different architecture than the integration-kit's signed-HTTP-webhook model, so this first slice covers the dominant use case — _automations posting to Discord_ — and adds no triggers, no events, no inbound endpoint, and no tRPC router. (Slash-command triggers, then a gateway worker for message triggers, are the natural follow-ups.)

## What's here

- **`/contracts`** — no domain events (`DiscordEvents = never`); [discord.ts](src/contracts/discord.ts) has `isDiscordWebhookUrl` (validates a channel-webhook URL, defence-in-depth on top of `safeFetch`'s SSRF guard).
- **`/server`**
  - [client.ts](src/server/client.ts) — `discordRequest` (bot REST via the kit's `createRestClient` with `Bot <token>` auth) + `sendToWebhookUrl` (POST to a channel webhook URL, no bot).
  - [nodes/](src/server/nodes) — six action nodes registered under `discord` via `registerAutomationNodes`; each resolves its credential from the run's secret store (`ctx.getSecret`).
  - [feature-flags.ts](src/server/feature-flags.ts) — `discord.enabled`.

## Connecting

No connection UI or webhook to configure — the credential is a secret:

- **Bot nodes** — create a Discord app + bot, invite it to the server with the channels' access, and store its **bot token** as a secret under Admin → Secrets. Reference that secret in the node's _Bot token_ field.
- **Webhook send** — Channel → Integrations → Webhooks → copy the **webhook URL**, store it as a secret, and reference it in _Send via webhook_ (no bot needed).

## Nodes

`send-message` (bot → channel), `send-webhook-message` (channel webhook URL), `edit-message`, `add-reaction`, `list-messages`, `get-channel`. Each declares `outputFields` for the variable picker.

## Public API

`registerDiscordFeatureFlags` / `registerDiscordAutomationNodes` (`/server`, wired at api boot); `discordRequest` (`/server`); `isDiscordWebhookUrl` (`/contracts`). No events, no router, no data model.

Built on `@monark/integration-kit` (`createRestClient` gained a configurable auth scheme — `Bot` vs `Bearer` — for this). See `@monark/github` for the fuller (trigger + read + write) integration shape.
