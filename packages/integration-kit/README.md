# @monark/integration-kit

Shared, provider-agnostic plumbing for **automation integrations** — a third-party service (GitHub, and future Slack/Jira/Linear/…) that plugs into the core `@monark/automation` engine via an **inbound webhook** (its events trigger flows) and **action nodes** (read/write the service). It's the reusable ~80% so a new integration is a couple hundred lines of _provider-specific_ code, not eight hundred of boilerplate.

Not a tiered module (like `@monark/common` / `@monark/components`): a library, absent from `modules.manifest.ts`. An integration marks its relationship to automation with `integrates: "@monark/automation"` in the manifest, which `check:tiers` enforces (it must depend on its target).

## `/server`

- **`defineInboundWebhook({ secretKey, verify, map, label })`** — builds the inbound handler: resolves the org's signing secret from `@monark/secrets`, verifies the signature, translates a delivery to a domain event via `map`, and `emit()`s it (where the automation subscriber fires matching flows). Unmodeled deliveries → 202 (ack, no retry); missing connection → 404; bad signature → 401. The integration supplies only what's provider-specific.
- **`verifyHmacSha256(rawBody, secret, signature, { prefix })`** — constant-time signature check over the raw body (GitHub uses `prefix: "sha256="`).
- **`makeConnectionSecretRouter({ secretKey, permission, webhookPathPrefix, secretDescription })`** — a tRPC router (`status` / `generateWebhookSecret` / `disconnect`) managing the per-org signing secret + reporting the inbound endpoint path, gated by `permission`. The integration exports `router({ connection: makeConnectionSecretRouter(...) })` as its `*Router`.
- **`createRestClient({ baseUrl, defaultHeaders, timeoutMs, maxBytes })`** → `.request({ token, method, path, body, headers })` — a token-authenticated JSON client over the shared SSRF-guarded `safeFetch`, throwing a readable error (with the provider's `message`) on a non-2xx. Plus `pickString` / `pickNumber` for reading loosely-typed API objects.

## Building an integration on top

1. Manifest: `"@monark/<svc>": { tier: "extended", integrates: "@monark/automation" }`.
2. `contracts/events.ts`: the `svc.*` domain events (+ register their types/fields).
3. `server`: a `mapEvent` (delivery → event) → `defineInboundWebhook`; nodes via `defineNode` + `registerAutomationNodes`, calling `createRestClient`; `makeConnectionSecretRouter` for the connection.
4. api boot: register the flags / permissions / event-types / nodes, and mount `POST /hooks/<svc>/:org`.

See `@monark/github` as the reference implementation.
