# Public API

> **Update (2026-08-03, as-built):** the **scope layer was dropped** during
> implementation. Authority is now **100% RBAC** — a key acts as its principal
> and inherits that principal's roles ; there is no `scopes` column, no
> `API_SCOPES` catalog, and no `assertScope`. Design decision 4 and the
> `scopes`-bearing snippets below are **superseded**. Least-privilege is done by
> choosing the principal (a service account with a limited role — see
> [public-api-service-accounts.md](public-api-service-accounts.md)), not by
> scoping a key. The `projects:read` scope was also removed : projects are
> polymorphic Data Model records, so there is no separate projects endpoint.
> Routes advertise their required RBAC permission in OpenAPI (`x-required-permission`).

## Context

Monark's data layer (polymorphic Data Models, RBAC, org scoping, domain events, webhooks, automation) is solid, but every caller today must present a **Supabase user JWT** — there is no machine credential and no externally-consumable contract. The [participation & agent brainstorm](../../../) identified the Public API as the **foundation** the rest of the roadmap (feeds, contribution flow, MCP, BYOA agents, Web3 incubator rails) builds on: without a permissioned, versioned, discoverable API, none of the agent or third-party stories work.

This spec plans that foundation. It is deliberately the _substrate_ layer — a curated, key-authenticated, OpenAPI-described REST surface over the primitives that already exist — not a new product surface.

### What exists (verified) — reuse

- **Transport**: a single Express app ([services/api/src/server.ts](../../../services/api/src/server.ts)) already mounts tRPC at `/trpc`, plus plain HTTP endpoints (`/cron/*` with a `CRON_SECRET` bearer, `/hooks/automation/:id` with a per-automation constant-time secret). A public API mounts alongside these.
- **Context seam**: [context.ts](../../../services/api/src/trpc/context.ts) turns a bearer token into `{ userId, activeOrganizationId, requestId }`. The RBAC guards ([rbac/server/guards.ts](../../../packages/rbac/src/server/guards.ts) `requirePermission`/`requireRoleKey`, and `requireOrg`) accept **any** structural `{ userId, activeOrganizationId }` — so a key just needs to synthesize that triple and the whole guard + router stack works unchanged.
- **Permission engine**: `hasPermission(userId, "<module>.<key>", orgId)` resolves off `RoleAssignment` rows (no live `User` needed at read time), with the ADMIN/SYSADMIN short-circuit and per-module `registerPermissions`.
- **Token hashing house style**: mint `randomBytes(32)`, store only `sha256(plaintext)` hex in a `@unique` column, return plaintext once, compare with `timingSafeEqualHex` (invites, webhooks `whsec_…`, trusted-devices). `@monark/common/crypto` provides the helpers.
- **Durable audit substrate**: the webhooks outbox persists every emitted domain event (`emit(...)` + `registerEventTypes(...)`).

### What's greenfield — build

API-key model + auth ; a principal mapping (RBAC's `RoleAssignment.userId` is a hard FK to `User`) ; non-interactive org resolution (keys have no Supabase session) ; a generic rate-limit primitive (backlogged, token-bucket intended) ; an OpenAPI / machine-readable description (none today) ; and per-key usage/audit.

## Goals

- A versioned, **REST + OpenAPI** public surface (`/api/v1/*`) that external clients, scripts, and (later) MCP servers + agents can consume — language-agnostic, discoverable, stable, and **curated** (a chosen subset, not the whole internal API).
- **API-key authentication** that synthesizes the same `{ userId, activeOrganizationId }` context the guards already consume, so authorization is the existing RBAC — a key can never exceed its owner's permissions.
- **Scoped, org-pinned, revocable, expiring** keys, minted once and shown once (house hashing pattern).
- A reusable **rate-limit primitive** (satisfying the backlogged need shared by webhooks + the automation HTTP trigger).
- Machine-friendly **schema discovery** (list Data Models + fields) so an agent can learn the shape of the world before acting.
- Per-key **usage/audit** via existing domain events + `lastUsedAt`.

## Non-goals (this iteration)

- **No OAuth / third-party app authorization flow** — API keys only in v1 (OAuth is a later feature once there's a developer ecosystem).
- **No service accounts (non-human principals) in v1** — v1 ships user keys (key-as-user) ; org-owned machine principals (admin keys) are the v2 fast-follow (see Design decision 2).
- **No GraphQL, no public tRPC** — the public contract is REST/OpenAPI. (First-party TS keeps using internal tRPC unchanged.)
- **No write access to schema** (creating Data Models / fields) over the public API in v1 — records + reads only ; schema mutation stays admin-UI-only.
- **No full audit-log facility** — v1 uses existing domain events + `lastUsedAt` ; a queryable `ApiRequestLog` is deferred.
- Not exposing the entire internal surface — v1 is a small, high-value resource set.

## Design decisions

1. **Curated REST + OpenAPI facade, not raw tRPC or an auto-bridge.** The public contract is a hand-curated set of REST routes whose request/response are zod schemas, from which we generate the OpenAPI spec (a small zod→JSON-schema step). Rationale: agents / third parties / SDKs want REST + OpenAPI, not tRPC-over-POST ; a curated surface stays **stable and decoupled** from internal tRPC churn ; and the OpenAPI spec is the direct input to the future MCP server + client SDKs. The handlers call the **same server data functions + RBAC guards** the tRPC procedures use, so there is no logic duplication — only a thin transport + a curated contract.

2. **Two key kinds mapping to two principal models — user keys first, service accounts as a fast-follow (DECIDED).** Both are wanted: **user keys** for community-member workflows / BYOA agents, and **admin/service-account keys** for org-owned external-service integrations.
   - **v1 — user keys (key-as-user).** An `ApiKey` maps to `{ ownerUserId, organizationId, scopes }` ; the synthesized context is `{ userId: ownerUserId, activeOrganizationId: key.organizationId }`, so RBAC resolves against the owner's real grants + membership with **zero RBAC schema surgery**. BYOA-aligned ("your agent acts as you, within your permissions"). Managed at `/account/api-keys`.
   - **v2 fast-follow — admin/service-account keys.** An org-owned machine principal, modeled as a real "machine `User`" row (a `User` that never logs in, just an RBAC anchor with a membership + a minimal dedicated role) — satisfies the `RoleAssignment.userId` FK with **no polymorphic-principal change**. Managed at `/admin/api-keys`. Same `ApiKey` model (`ownerUserId` points at the machine user).

3. **Keys are org-pinned.** A JWT derives org from `user_metadata.active_organization_id` ; a key has no session, so it **carries exactly one `organizationId`**. `ctx.activeOrganizationId = key.organizationId`, and `requireOrg` validates the owner still has a live membership there (reusing `isMember`) — a key dies if its owner leaves the org.

4. **Scopes intersect the owner, never exceed.** A key carries a scope allow-list (coarse, e.g. `data-models:read`, `data-models:write`, `projects:read`). Effective authority = **owner's RBAC permission AND the key's scope allows it**. Enforced by a small `assertScope(ctx, permission)` in the facade _before_ the existing `requirePermission` — so both gates must pass. A key can only ever narrow, following the GitHub-PAT model.

5. **House hashing, recognizable prefix.** Keys are `mrk_<base64url(32 bytes)>`, stored as `sha256` hex in a `@unique` column, returned once. Lookup by hash (unique index) + `timingSafeEqualHex`. The `Secret` module is deliberately **not** reused (it's reversible encryption keyed by human name — the wrong shape for a one-way-verified credential).

6. **Rate limiting as a shared primitive — Postgres-backed, storage-agnostic interface (DECIDED).** Build a generic token-bucket (per key + per IP) in `@monark/common` behind a storage-agnostic interface, backed by **Postgres** for v1 so it holds across api instances (the in-memory TOTP window doesn't survive multi-process ; the stack has no Redis today). Best-practice-for-the-stack ; the interface lets us swap in Redis / an edge limiter later if volume demands, without touching call sites. Satisfies the backlog items that want the same primitive for webhooks + the automation HTTP trigger.

## Architecture

| Module                         | Tier | Responsibility                                                                                                                                                                                                                 |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@monark/api-keys` (**new**)   | core | `ApiKey` model, mint / verify / revoke, scope model, the key-management tRPC router (admin UI), and `authenticateApiKey(token) → { userId, organizationId, scopes } \| null`.                                                  |
| `@monark/public-api` (**new**) | core | The route-descriptor registry (method + path + input/output zod + required permission + scope + handler), OpenAPI generation from it, and the `assertScope` guard. Handlers call existing `@monark/<module>/server` functions. |
| `@monark/common` (existing)    | core | Add a generic **token-bucket rate limiter** (DB-backed) reused by public-api, webhooks, and the automation HTTP trigger.                                                                                                       |
| `services/api` (existing)      | —    | Mounts the public-api Express router at `/api/v1`, serves `/api/v1/openapi.json`, and wires the API-key context synthesis (mirroring the JWT path in `context.ts`).                                                            |

Auth is a **facade concern**, not a procedure-middleware change: the public routes synthesize the context themselves, so the internal tRPC surface and its guards are untouched.

## Data model (`@monark/api-keys`, core — its own `prisma/api-keys.prisma` fragment)

```prisma
model ApiKey {
  id             String    @id @default(cuid())
  organizationId String    // the org the key acts in (org-pinned)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  ownerUserId    String    // the principal ; key can't exceed this user's grants
  owner          User      @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)
  name           String    // human label ("CI bot", "my agent")
  tokenHash      String    @unique // sha256 hex of the plaintext (never stored)
  prefix         String    // first chars of the plaintext, for display ("mrk_ab12…")
  scopes         String[]  @default([]) // coarse scope allow-list ; empty = deny-all
  lastUsedAt     DateTime?
  expiresAt      DateTime?
  createdBy      String    // no FK, house convention
  revokedAt      DateTime?
  createdAt      DateTime  @default(now())

  @@index([organizationId])
  @@index([ownerUserId])
}
```

## Auth flow

1. Request → `Authorization: Bearer mrk_…` to `/api/v1/*`.
2. Facade middleware: `authenticateApiKey(token)` → hash the presented key, unique-index lookup, reject if missing / revoked / expired, stamp `lastUsedAt` (throttled write). Returns `{ userId: ownerUserId, activeOrganizationId: organizationId, scopes, requestId }` — a `TrpcContext` plus `scopes`.
3. Rate-limit check (per key + per IP token bucket) → `429` with `Retry-After` on exhaustion.
4. Handler: `assertScope(ctx, "<module>.<key>")` (key scope gate) → `requireOrg(ctx)` + `requirePermission(ctx, "<module>.<key>", org.id)` (existing RBAC) → call the shared server function.
5. Response: JSON, standard HTTP status codes, `X-Request-Id` echoed. Mutations emit their existing domain events (audit via the webhook outbox).

## v1 surface (curated, small)

- **Schema discovery** (agent-critical): `GET /api/v1/models`, `GET /api/v1/models/{key}/fields`.
- **Records** (the core payload): `GET/POST /api/v1/models/{key}/records`, `GET/PATCH/DELETE /api/v1/models/{key}/records/{id}` — cursor pagination + `fieldFilters` mirroring `listDataRecords`. Reuses per-model + per-record RBAC exactly.
- **Read-only projects**: `GET /api/v1/projects`, `GET /api/v1/projects/{id}` (real-world project directory).
- **Discovery**: `GET /api/v1/openapi.json` (the generated spec), `GET /api/v1/me` (the key's principal + org + scopes, for client bootstrapping).

Everything else (kanban, calendar, automation, files, feeds) is added surface-by-surface later, each a route descriptor + OpenAPI entry — the registry makes expansion incremental.

## Rate limiting

A DB-backed token bucket keyed by `apiKeyId` and by client IP (two buckets, the stricter wins). Default generous per-key limits, tighter unauthenticated/IP limits. Extracted into `@monark/common` so the automation HTTP trigger and webhook worker adopt it (closing the three backlog items). `429` + `Retry-After` + `X-RateLimit-*` headers.

## Key management (admin UI + issuance)

- tRPC router `apiKeys.{ list, create, revoke }` (gated by a new `api-keys.manage` permission), surfaced at `/admin/api-keys` (or per-user `/account/api-keys`).
- `create` returns the plaintext **once** (copy-to-clipboard, never retrievable again) ; the list shows `prefix`, name, scopes, `lastUsedAt`, `expiresAt`, revoked state.
- Scope picker constrained to the coarse scope catalog ; expiry optional.

## Build order

1. **Rate-limit primitive** in `@monark/common` (token bucket, DB-backed) + a migration for its counter table.
2. **`@monark/api-keys`**: model + fragment + migration, `mint`/`authenticateApiKey`/`revoke`, `api-keys.manage` permission, the management tRPC router, events (`api-keys.key-created` / `-revoked`).
3. **`@monark/public-api`**: the route-descriptor registry + `assertScope` + OpenAPI generation ; implement the v1 descriptors (models, records, projects, me).
4. **`services/api` wiring**: mount `/api/v1` on the Express app, the API-key auth middleware (mirroring `context.ts`), rate-limit middleware, `/api/v1/openapi.json`.
5. **Admin UI**: `/admin/api-keys` (or `/account/api-keys`) create/list/revoke, plaintext-once flow.
6. **Cross-cutting**: RBAC permission + events registered at boot ; feature-flag `public-api.enabled` (kill switch) ; i18n (en + fr) for the key UI ; module READMEs + a `docs/technical-documentation/public-api.md` (auth, scopes, endpoints, examples) ; user-guide page ; CHANGELOG.

## Verification

- **Integration** (`@monark/api-keys` + `@monark/public-api` suites): mint → authenticate round-trip ; reject revoked / expired / unknown / wrong-hash ; org-pin enforced (owner-left-org → 401/403) ; scope gate (key without `data-models:write` → 403 on POST even if the owner can write) ; RBAC still enforced (key whose owner lacks the permission → 403) ; rate-limit returns 429 after N ; `lastUsedAt` stamped.
- **Contract**: `/api/v1/openapi.json` validates against the OpenAPI schema ; a generated client can round-trip a record CRUD.
- **Manual E2E**: mint a key in the UI, `curl` a record list + create with it, confirm scope/permission rejections, confirm 429 under a loop, revoke and confirm 401.
- **Gate**: `pnpm gen && pnpm typecheck && pnpm lint && pnpm test && pnpm check:tiers && pnpm check:modules && pnpm check:i18n`.

## Deferred / open decisions

**Deferred to later features:**

- **Service accounts** (org-owned machine principals, modeled as a flagged `User` row) — v2.
- **OAuth 2.0 / app authorization** — once a developer ecosystem exists.
- **Inbound write of schema**, kanban/calendar/automation/files/feeds surfaces — added incrementally.
- **Full audit-log facility** (`ApiRequestLog`) — v1 relies on domain events + `lastUsedAt`.
- **Public/unauthenticated read** of public Data Models — depends on the "data as public good" values call from the brainstorm.

**Decided:**

- **(3) Rate-limit store** → Postgres-backed token bucket behind a storage-agnostic interface (swap to Redis later without touching call sites).
- **(4) Key ownership** → **both**: user keys (`/account/api-keys`, community workflows / BYOA) ship **first** ; admin/service-account keys (`/admin/api-keys`, external-service integrations) are the v2 fast-follow. These map onto the two principal models in Design decision 2.

**Still to confirm before building:**

1. **REST facade vs. an auto-bridge from tRPC** (`trpc-to-openapi`). This spec recommends the curated facade (stable, decoupled, clean OpenAPI for MCP/SDKs) ; the bridge is less code up front but chains the public contract to internal tRPC shape + a library's v11 support.
2. **Confirm user-keys-first sequencing** (v1 user keys → v2 admin/service-account keys), per Design decision 2.
