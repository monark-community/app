# @monark/api-keys

Hashed, org-pinned **API keys** for the public API. A key authenticates a
non-interactive caller (a script, an agent, an integration) without a Supabase
session, acting as its owning **principal** with that principal's RBAC roles.
Core module. Spec: [docs/features-planning/phase-3/public-api.md](../../docs/features-planning/phase-3/public-api.md)
· [service accounts (v2)](../../docs/features-planning/phase-3/public-api-service-accounts.md).

## What's here

- `/contracts` — the `ApiKeysEvents` union.
- `/server` — the `apiKeysRouter` (personal keys: `list` / `create` / `revoke`,
  gated by `api-keys.manage` ; plus the `serviceAccounts` sub-router, gated by
  `api-keys.manage-service-accounts`), `authenticateApiKey(plaintext)` (the
  verify seam the public-API facade consumes), the mint/hash data layer, and the
  `register*` boot helpers.
- `/client` — placeholder.

## Key concepts

- **Authority is 100% RBAC — there is no scope layer.** A key acts as its
  principal ; the principal's roles decide what it can do. `authenticateApiKey`
  returns `{ apiKeyId, userId, organizationId }` (plus the ceiling fields
  `fullAccess` / `permissions` ; see below), and the facade turns the principal +
  org into the `{ userId, activeOrganizationId }` context the existing RBAC guards consume.
  A key can never exceed its principal's grants (zero RBAC schema change), and
  it never adds a parallel permission taxonomy.
- **Two principal kinds.** A **user key** acts as its human creator (BYOA — "a
  headless me"). A **service-account key** acts as an org-owned machine `User`
  (`kind = SERVICE`) with its own admin-assigned roles.
- **Optional per-key ceiling ("abstract sub-role").** A key with
  `fullAccess = false` is capped to `permissions` — a subset of the _owner's own_
  RBAC permissions, picked from the catalog filtered to what they hold. It is
  only ever a ceiling : the live RBAC floor still runs against the owner, so a
  key can never exceed the owner's _current_ grants and loses a permission the
  moment the owner does. `fullAccess = true` (default) = the owner's full
  authority. Service-account keys stay `fullAccess = true` (narrowing there is
  the account's roles). Empty allowlist + not-full = deny-all (fails closed).
- **Org-pinned.** A key carries exactly one `organizationId` ; `requireOrg`
  validates the principal's live membership there.
- **Owner-alive.** `authenticateApiKey` rejects a key whose principal is
  disabled / deleted — so disabling a service account instantly kills its keys.
- **Hash on write, plaintext once.** `mint` → `mrk_<base64url(32)>` ; only the
  SHA-256 hash is stored (a `@unique` column), the plaintext is returned once
  and never retrievable. Matches the invite / webhook / trusted-device pattern.
- **Debounced `lastUsedAt`.** Authentication stamps last-used at most once a
  minute to avoid a write per request.

## Public API

| Import                       | Export                                                                                                                   | Kind                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `@monark/api-keys/server`    | `apiKeysRouter`                                                                                                          | tRPC router (`apiKeys.{list,create,revoke}` + `apiKeys.serviceAccounts.*`)                               |
| `@monark/api-keys/server`    | `authenticateApiKey(plaintext)`                                                                                          | `Promise<AuthenticatedApiKey \| null>` (`{ apiKeyId, userId, organizationId, fullAccess, permissions }`) |
| `@monark/api-keys/server`    | `registerApiKeysPermissions` / `registerApiKeysEventTypes`                                                               | boot helpers                                                                                             |
| `@monark/api-keys/contracts` | `ApiKeyCreatedEvent`, `ApiKeyRevokedEvent`, `ServiceAccountCreatedEvent`, `ServiceAccountDisabledEvent`, `ApiKeysEvents` | event types                                                                                              |

## Data model

`ApiKey` under the `// ── MODULE: api-keys ──` banner in
[prisma/api-keys.prisma](prisma/api-keys.prisma) (assembled into the generated
`schema.prisma`). FK to `Organization` + `User`, both cascade. Migrations:
`20260802120000_add_api_keys`, `20260803120000_drop_api_key_scopes`,
`20260803130000_add_api_key_permission_ceiling`. Service
accounts reuse the core `User` row (`kind = SERVICE`, migration
`20260802140000_add_user_kind`) — no table of their own.

## Events emitted

- `api-keys.key-created` / `api-keys.key-revoked` — a key was minted / revoked
  (never carries the plaintext / hash).
- `api-keys.service-account-created` / `api-keys.service-account-disabled`.

All webhook-subscribable via `registerApiKeysEventTypes()`.

## RBAC

- `api-keys.manage` — a member creates / lists / revokes **their own** keys.
- `api-keys.manage-service-accounts` — an admin manages the org's **service
  accounts** and their keys.

Both default off and are grantable ; built-in ADMIN / SYSADMIN short-circuit.
Neither widens what a key can do — a key's authority is always its principal's
roles.
