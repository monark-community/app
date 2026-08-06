# @monark/telegram

**Extended module — an _automation integration_** (`integrates: "@monark/automation"` in the manifest; `check:tiers` enforces the dependency). Built on `@monark/automation` (the node registry + event bus) and `@monark/integration-kit` (the shared inbound-webhook / constant-time-verify plumbing), it adds Telegram **trigger events** (a message sent to the bot, a `/command`) that fire your automations, and Telegram **action nodes** (send / edit / delete message, send photo, get chat) that a flow uses to talk back. Flag-gated (`telegram.enabled`, default off).

**Status:** MVP shipped end-to-end — inbound webhook → domain events → automation triggers, plus five action nodes calling the Telegram Bot API. Auth is a **bot token** (from [@BotFather](https://t.me/BotFather)) stored in the secrets substrate; the connect flow registers the webhook with Telegram for you (`setWebhook`).

## What's here

- **`/contracts`** — the two `telegram.*` [domain events](src/contracts/events.ts) (flat payloads with `organizationId` + the originating chat / sender) and connection constants ([telegram.ts](src/contracts/telegram.ts): the bot-token + webhook-secret keys, `parseCommand`).
- **`/server`**
  - [webhook.ts](src/server/webhook.ts) — `handleTelegramWebhook`: compares Telegram's `X-Telegram-Bot-Api-Secret-Token` against the org's stored secret in constant time, maps an update to a `telegram.*` event, and `emit()`s it. `mapTelegramUpdate` is the pure translation (text → `message-received`, `/command` → `command`).
  - [nodes/](src/server/nodes) — the action nodes, registered under the `telegram` namespace via `registerAutomationNodes`. Each reads the org's connected bot token (`ctx.getSecret`) and calls Telegram through [client.ts](src/server/client.ts) (`telegramCall`, over the shared SSRF-guarded `safeFetch`).
  - [event-types.ts](src/server/event-types.ts) / [permissions.ts](src/server/permissions.ts) / [feature-flags.ts](src/server/feature-flags.ts) — boot-time registrations.
  - [router.ts](src/server/router.ts) — `telegramRouter.connection`: status / connect / disconnect.
- **`/client`** — reserved (the `/telegram` settings surface lives in the web app).

## Key concepts

**Triggers ride the event bus.** After connect calls `setWebhook`, Telegram → `POST /hooks/telegram/:org` → verify the secret-token header → `emit` a `telegram.*` event carrying `organizationId`. The automation subscriber already fires any enabled automation whose trigger matches, so no automation-side code is needed — the event just has to exist (declared in `contracts/events.ts`, registered with `registerEventTypes`). We subscribe to `message` updates only; unmodeled updates (edits, callbacks, non-text) are acked `202` so Telegram doesn't retry.

**One canonical bot token per org.** Unlike GitHub / Discord (where each node names its own token secret), a Telegram connection stores a single bot token under `telegram.bot-token`: the connect flow writes it, every node reads it (nodes carry no token field — just the target chat), and it authenticates outbound calls. "Connected" == that secret exists.

**Where it diverges from the kit.** The kit's `createRestClient` fits header-bearer JSON APIs; Telegram doesn't — the bot token rides in the URL _path_ (no `Authorization` header) and responses are a `{ ok, result, description }` envelope — so `client.ts` calls `safeFetch` directly (unwrapping `result`, surfacing `description` on error). It still uses the kit's `pickString` / `pickNumber`, and its inbound side is `defineInboundWebhook` with a new verify style: `constantTimeEquals` (Telegram signs nothing over the body — the whole auth is the echoed secret token). Because connect must call `setWebhook` (registering + validating the token), the connection router is bespoke rather than the shared `makeConnectionSecretRouter`.

**No new tables.** Per-org state is two `@monark/secrets` entries — `telegram.bot-token` and the inbound `telegram.webhook-secret` (both write-only; decrypted server-side only to call Telegram / verify a delivery).

## Public API

| Export                                                                                                          | From         | Purpose                                                          |
| --------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------- |
| `registerTelegramEventTypes` / `registerTelegramFeatureFlags` / `registerTelegramPermissions`                   | `/server`    | Boot-time registrations.                                         |
| `registerTelegramAutomationNodes`                                                                               | `/server`    | Register the Telegram action nodes with the automation registry. |
| `handleTelegramWebhook` / `mapTelegramUpdate`                                                                   | `/server`    | Inbound webhook verification + update→event mapping.             |
| `telegramRouter`                                                                                                | `/server`    | The `telegram.connection.*` tRPC surface.                        |
| `telegramCall`                                                                                                  | `/server`    | One Telegram Bot API call (used by nodes + connect).             |
| `TelegramEvents` and the per-event types / `TELEGRAM_EVENT_TYPES` / `parseCommand` / `TELEGRAM_*_KEY` constants | `/contracts` | The event union + connection constants.                          |

## Data model

None owned. Per-org config lives in the `@monark/secrets` substrate (`telegram.bot-token`, `telegram.webhook-secret`) — no Prisma fragment, no migration.

## Events emitted / consumed

**Emitted** (from inbound webhooks, subscribable + usable as automation triggers): `telegram.message-received`, `telegram.command`. **Consumed:** none.

## tRPC surface

`telegram.connection.status` (query), `telegram.connection.connect` (mutation — stores the bot token, mints the webhook secret, calls `setWebhook`), `telegram.connection.disconnect` (mutation — `deleteWebhook` + clears the secrets) — all gated by `telegram.manage`.
