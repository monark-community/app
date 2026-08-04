# @monark/public-api

The transport-agnostic toolkit behind Monark's curated **REST + OpenAPI**
public surface (`/api/v1/*`), authenticated by `@monark/api-keys`. Core
**library** module (no tRPC router). Spec:
[docs/features-planning/phase-3/public-api.md](../../docs/features-planning/phase-3/public-api.md).

## What's here

This package owns the reusable, framework-free pieces ; the Express mount and
the concrete route descriptors live in
[services/api/src/public](../../services/api/src/public) (which has the
`AppRouter` type + a server-side caller).

- `/server`
  - `RouteDescriptor<TCaller>` — the description of one REST endpoint (method,
    path, the RBAC `permission` it documents, zod request/response schemas,
    handler).
  - `buildOpenApiSpec(routes, info)` — derives an OpenAPI 3 document from the
    same descriptors that serve traffic, so the spec can't drift.
  - `zodToJsonSchema(schema)` — a small, curated Zod → JSON-Schema step (no
    external dependency ; covers the constructs the v1 schemas use).
  - `registerPublicApiFeatureFlags()` + `PUBLIC_API_ENABLED_FLAG` +
    `PUBLIC_API_SERVICE_ACCOUNTS_FLAG`.

## Key concepts

- **Facade, not a bridge.** The REST layer is a thin adapter : `services/api`
  authenticates an API key, synthesizes the `{ userId, activeOrganizationId }`
  context a session would have, and invokes the **same tRPC procedures** the web
  app uses through `t.createCallerFactory(appRouter)`. All RBAC, per-record
  access, event emission, and validation are reused verbatim — the facade never
  re-implements authorization. See [api-keys](../api-keys/README.md).
- **Authority is 100% RBAC — no scope layer.** The key acts as its principal ;
  the procedure the caller invokes enforces the permission against that
  principal's roles. Each descriptor's `permission` is surfaced in OpenAPI as
  `x-required-permission` so a client knows which role a key's principal needs.
- **Optional per-key ceiling.** A key may additionally carry a permission
  allowlist (`fullAccess: false`) — a subset of the owner's permissions. The
  mount checks the route's `permission` against it _before_ invoking the caller,
  so it caps the key (even for an admin owner) on top of the live RBAC floor.
  Least-privilege = a service account with a limited role, **or** a personal key
  limited to a subset of your own permissions (see [api-keys](../api-keys/README.md)).
- **Spec derives from routes.** OpenAPI paths, params, request bodies, the
  bearer security scheme, and each route's required permission all come from the
  descriptors — one source of truth.
- **Flag-gated.** Every `/api/v1` route (and the OpenAPI doc) 404s unless
  `public-api.enabled` is on (off by default), resolved per-request in the
  caller's context so an org / user override applies.

## v1 REST surface

| Method + path                       | Required permission         | Backing procedure            |
| ----------------------------------- | --------------------------- | ---------------------------- |
| `GET /api/v1/me`                    | —                           | (from the key)               |
| `GET /api/v1/models`                | `data-models.read-schema`   | `dataModels.models.list`     |
| `GET /api/v1/models/{key}`          | `data-models.read-schema`   | `dataModels.models.getByKey` |
| `GET /api/v1/models/{key}/fields`   | `data-models.read-schema`   | `dataModels.fields.list`     |
| `GET /api/v1/models/{key}/records`  | `data-models.record-read`   | `dataModels.records.list`    |
| `POST /api/v1/models/{key}/records` | `data-models.record-write`  | `dataModels.records.create`  |
| `GET /api/v1/records/{id}`          | `data-models.record-read`   | `dataModels.records.getById` |
| `PATCH /api/v1/records/{id}`        | `data-models.record-write`  | `dataModels.records.update`  |
| `DELETE /api/v1/records/{id}`       | `data-models.record-delete` | `dataModels.records.delete`  |
| `GET /api/v1/openapi.json`          | — (public, flag-gated)      | —                            |

Authenticate every call (except `openapi.json`) with the key as a Bearer token:

```bash
curl -H "Authorization: Bearer mrk_…" https://<host>/api/v1/me
```

Responses are JSON ; errors are `{ "error": { "code", "message" } }` with the
matching HTTP status. Rate limits (per key) surface as `X-RateLimit-*` +
`Retry-After` headers, backed by `@monark/common/rate-limit`.

## Public API

| Import                      | Export                                                                                         | Kind              |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ----------------- |
| `@monark/public-api/server` | `RouteDescriptor`, `RouteHandlerArgs`, `RoutePrincipal`, `HttpMethod`                          | types             |
| `@monark/public-api/server` | `buildOpenApiSpec(routes, info)`                                                               | OpenAPI 3 builder |
| `@monark/public-api/server` | `zodToJsonSchema(schema)`                                                                      | Zod → JSON-Schema |
| `@monark/public-api/server` | `registerPublicApiFeatureFlags`, `PUBLIC_API_ENABLED_FLAG`, `PUBLIC_API_SERVICE_ACCOUNTS_FLAG` | flag boot helper  |

## Feature flags

- `public-api.enabled` (defaultOn: **false**) — master kill switch for `/api/v1`.
- `public-api.service-accounts` (defaultOn: **false**) — the v2 service-account
  admin surface + management procedures.

## Data model

None of its own. The facade reads/writes through core Data Models procedures ;
API keys live in [`@monark/api-keys`](../api-keys/README.md) and the rate-limit
bucket in [`@monark/common/rate-limit`](../common/src/rate-limit.ts) (core
`RateLimitBucket` table).

## Shipped since spec

The mount has end-to-end HTTP integration tests (`services/api/tests/integration/public-api.test.ts`, real Express over supertest) ; the v1 key-management UI lives at `/account/api-keys` ; and the v2 admin / service-account surface ships behind the `public-api.service-accounts` flag (`/admin/service-accounts`).
