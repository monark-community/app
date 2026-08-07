# @monark/twitter

**Extended module — an _automation integration_** (`integrates: "@monark/automation"` in the manifest; `check:tiers` enforces the dependency). Built on `@monark/automation` (the node registry) and `@monark/integration-kit` (for `pickString`), it adds X (Twitter) **action nodes** — post a tweet, reply, delete — that an automation uses to publish to X. Flag-gated (`twitter.enabled`, default off).

**Status:** write-only MVP. **No triggers:** X has no inbound event webhook on any accessible API tier (real-time delivery is Enterprise-only Account Activity), so there are no domain events, no inbound endpoint, and no `/hooks` route — the same shape as Discord, for a different reason. The free API tier covers posting / deleting; reading + search need a paid tier and aren't modelled.

## What's here

- **`/contracts`** — `TwitterEvents = never` ([events.ts](src/contracts/events.ts)) and the four connection secret keys ([twitter.ts](src/contracts/twitter.ts)).
- **`/server`**
  - [oauth1.ts](src/server/oauth1.ts) — a pure OAuth 1.0a request signer (`percentEncode`, `signatureBaseString`, `oauth1Signature`, `buildAuthHeader`), unit-tested by pinning the exact signature base string + cross-checking the signature against an independent `node:crypto` HMAC.
  - [client.ts](src/server/client.ts) — `twitterCall`: signs each request and calls the X API v2 over the shared SSRF-guarded `safeFetch`, unwrapping `{ data }` / surfacing `{ detail | title | errors }` on failure. `requireCredentials` resolves the org's four secrets via `ctx.getSecret`.
  - [nodes/](src/server/nodes) — the action nodes, registered under the `twitter` namespace via `registerAutomationNodes`.
  - [permissions.ts](src/server/permissions.ts) / [feature-flags.ts](src/server/feature-flags.ts) — boot-time registrations.
  - [router.ts](src/server/router.ts) — `twitterRouter.connection`: status / connect / disconnect.
- **`/client`** — reserved (the `/x` settings surface lives in the web app).

## Key concepts

**OAuth 1.0a signing — a third client shape.** GitHub authenticates with a bearer header, Telegram with a token in the URL path; X posts on a user's behalf only with **OAuth 1.0a user context** — four static credentials (consumer key/secret + access token/secret) used to HMAC-SHA1-sign every request. There's no static header, so it doesn't fit the kit's `createRestClient` (`authHeader` returns a fixed string); [oauth1.ts](src/server/oauth1.ts) computes the per-request signature and [client.ts](src/server/client.ts) calls `safeFetch` directly — while still reusing the kit's `pickString`. (A second OAuth 1.0a provider would justify promoting the signer into the kit; one doesn't yet.)

**Credentials, not a browser flow.** The MVP uses the app owner's own X developer-portal credentials (OAuth 1.0a), stored per-org — no interactive OAuth 2.0 authorize/callback/refresh. `connect` stores the four secrets; it deliberately **doesn't** verify them with a live call, because X's free tier restricts the read endpoint that would validate them (a valid write-only credential set would wrongly fail) — the first post-tweet run surfaces any auth error. "Connected" == all four secrets exist; nodes read them directly (no per-node token fields).

**No new tables.** Per-org state is four `@monark/secrets` entries (write-only; decrypted server-side only to sign a request).

## Public API

| Export                                                       | From         | Purpose                                                   |
| ------------------------------------------------------------ | ------------ | --------------------------------------------------------- |
| `registerTwitterFeatureFlags` / `registerTwitterPermissions` | `/server`    | Boot-time registrations.                                  |
| `registerTwitterAutomationNodes`                             | `/server`    | Register the X action nodes with the automation registry. |
| `twitterRouter`                                              | `/server`    | The `twitter.connection.*` tRPC surface.                  |
| `twitterCall`                                                | `/server`    | One signed X API v2 call (used by the nodes).             |
| `TWITTER_*` secret-key constants / `TwitterEvents`           | `/contracts` | Connection constants + the (empty) event union.           |

## Data model

None owned. Per-org config lives in the `@monark/secrets` substrate (the four `twitter.*` credential keys) — no Prisma fragment, no migration.

## Events emitted / consumed

None (write-only; X exposes no accessible inbound event webhook).

## tRPC surface

`twitter.connection.status` (query), `twitter.connection.connect` (mutation — stores the four credentials), `twitter.connection.disconnect` (mutation — clears them) — all gated by `twitter.manage`.
