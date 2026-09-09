# 3.9 External integrations

> How the four integration/identity primitives (webhooks, secrets, API keys, service accounts) relate to each other, which direction each one points, and the known gaps between them : [identity-and-integration.md](../../identity-and-integration/_index.md).

## Webhooks (`@monark/webhooks`)

Outbound HTTP delivery of domain events with an at-least-once outbox.

- **Models**: `WebhookEndpoint` (org-scoped or platform-tier when `organizationId` null ; only the SHA-256 secret hash stored ; auto-disable after 5 consecutive failures), `WebhookSubscription` (exact or prefix match on event type), `WebhookDelivery` (outbox, unique idempotency key, backoff schedule), `WebhookDeliveryAttempt`.
- **Routing**: the wildcard subscriber (registered last, skips `webhook.*` to avoid recursion) matches `[event.type, ...subscriptionAliases]` against subscriptions and enqueues one delivery per matching endpoint ; platform-tier endpoints always match, org endpoints match their org, user-tied events fan out to the user's member orgs.
- **Delivery**: a 5s worker (cron `/cron/sweep-webhook-deliveries` as fallback) POSTs with HMAC-SHA256 signature headers (`Webhook-Signature: v1=…`, timestamp, delivery id, idempotency key), 10s timeout, exponential backoff to a 5-attempt limit, then permanent failure + operator notification. Outbound URLs are SSRF-guarded (`assertOutboundUrlSafe`: https-only in prod).
- **tRPC** (`webhooks.*`): endpoint CRUD (`create` returns the plaintext secret once), `rotateSecret`, `listDeliveries`/`getDelivery`/`retryDelivery`, `listEventTypes` (org-visibility filtered). **UI**: `/admin/webhooks`.

## Public API (`@monark/public-api`)

A curated **REST + OpenAPI** surface at `/api/v1`, mounted before `/trpc`. It has **no data model and no tRPC router of its own** ; it is a **facade** that authenticates an API key, synthesizes `{ userId, activeOrganizationId }`, and invokes the **same tRPC procedures** the web app uses via a caller factory ; so RBAC, validation, and event emission are reused verbatim.

- **Auth**: `Authorization: Bearer <apiKey>` → the key's principal. Authority is the principal's RBAC (no parallel scope taxonomy) ; a key may additionally carry an optional per-key permission **ceiling** (see Access below). Each route chain is `apiKeyAuth → rateLimit → handler`, per-request flag-gated.
- **Access is org-scoped or user-scoped by principal kind**: a **user key** acts as its human creator ; a **service-account key** acts as an org-owned machine user with its own roles. The key is pinned to one organization. **Optional per-key ceiling**: a key with `fullAccess: false` is capped to a `permissions` allowlist (a subset of the owner's own RBAC permissions, checked in the mount before the caller runs) ; it only ever narrows the owner's live authority, never widens it, and even caps an admin owner. Least privilege = a limited-role principal, or a personal key restricted to a subset of your own permissions.
- **Routes today** map only to Data Models: `GET /me`, `GET /models`, `GET /models/:key`, `GET /models/:key/fields`, `GET|POST /models/:key/records`, `GET|PATCH|DELETE /records/:id`, plus `GET /openapi.json`.
- **Rate limiting**: per-key Postgres-backed token bucket (default refill 5/s, burst 20 ; `X-RateLimit-*` + `Retry-After`). **Versioning**: URL-prefixed `/api/v1`.
- **Flags**: `public-api.enabled` (default off, master kill switch), `public-api.service-accounts` (default off).

## API keys & service accounts (`@monark/api-keys`)

- **`ApiKey`**: `organizationId`, `ownerUserId` (the principal), `tokenHash` (SHA-256, unique ; plaintext returned once), `prefix` (display), `fullAccess` + `permissions` (the optional ceiling allowlist), `expiresAt?`, `revokedAt?`. `mrk_`-prefixed. Authentication rejects revoked/expired keys and keys whose owner is disabled or deleted. Authority is the owner's RBAC ; `fullAccess: false` caps the key to its `permissions` subset (a ceiling, never a widening).
- **Service accounts**: reuse the core `User` with `kind = SERVICE` (`svc_`-prefixed, `@service.invalid` email), org membership, and their own role grants ; disabling one instantly kills its keys.
- **Permissions**: `api-keys.manage` (own keys), `api-keys.manage-service-accounts` (admin ; also flag-gated). **tRPC** (`apiKeys.*`): `list`/`create`/`revoke` + a `serviceAccounts.*` sub-router. **UI**: personal keys at `/account/api-keys`, service accounts at `/admin/service-accounts`.
