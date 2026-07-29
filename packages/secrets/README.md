# @monark/secrets

A per-organization **encrypted secret store** — env-var style `key → value` pairs
(external access tokens, API keys) encrypted at rest with AES-256-GCM. It is the
substrate that lets automation nodes (and future integration modules) reach
external systems securely: an author references a secret by name in a node's
config, and at run time the node reads the plaintext via `ctx.getSecret("NAME")`.

`core` module. It owns its own `Secret` model in the shared `schema.prisma` under
the `// ── MODULE: secrets ──` banner and its migration.

## What's here

- **`contracts/`** — the `SecretsEvents` domain-event union (`secrets.created` /
  `.updated` / `.deleted`). Every event carries the secret's **name and org, never
  its value**.
- **`server/`** — the tRPC router (`index.ts`, exported as `secretsRouter`), the
  Prisma data layer (`data.ts`), permission registration (`permissions.ts`), and
  webhook event-type registration (`event-types.ts`). The server-only
  `getSecretValue` is re-exported for the automation engine's `ctx.getSecret`.
- **`client/`** — empty. The write-only admin surface lives in
  `services/web/src/app/(authed)/admin/secrets/`.

## Key concepts

- **Write-only over the wire.** The plaintext value never crosses the tRPC
  boundary. There is **no read-value procedure at all**. `adminList` returns names
  - metadata only; `adminSet` accepts a new value; the admin form can replace a
    value but never displays it. Reading the plaintext is server-only, via
    `getSecretValue` / `ctx.getSecret`, on the trusted node-execution path.
- **Encrypted at rest.** Values are AES-256-GCM encrypted (12-byte IV, 16-byte
  tag) keyed by `SECRETS_ENCRYPTION_KEY` — a 32-byte hex key **separate from
  TOTP's** so their blast radii stay independent. The key is loaded lazily
  (fail-closed): a deploy that never touches secrets (e.g. CI) doesn't need it,
  but a set/read with it unset throws.
- **Per-org isolation.** Every row is scoped by `organizationId` and the
  `(organizationId, key)` unique. All reads take the org, so one org can never
  read another's value.
- **Decryption trust boundary.** Any registered automation node type can read any
  of _its own org's_ secrets via `ctx.getSecret`. Node types are installed code
  (same trust as server code), so this is acceptable; it is not a cross-tenant
  hole. There is no cross-org path.

## Public API

| Export                         | From                        | Purpose                                                                                                                                 |
| ------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `secretsRouter`                | `@monark/secrets/server`    | tRPC router: `adminList` (`secrets.read`), `adminSet` / `adminDelete` (`secrets.manage`).                                               |
| `getSecretValue(orgId, key)`   | `@monark/secrets/server`    | **Server-only.** Decrypt + return the plaintext (stamps `lastUsedAt`), or `null`. Never expose over tRPC / log / return as node output. |
| `listSecrets(orgId)`           | `@monark/secrets/server`    | Names + metadata only (the safe projection).                                                                                            |
| `SecretSummary`                | `@monark/secrets/server`    | The safe projection type (no value/ciphertext).                                                                                         |
| `registerSecretsPermissions()` | `@monark/secrets/server`    | Registers `secrets.{read,manage}` at boot.                                                                                              |
| `registerSecretsEventTypes()`  | `@monark/secrets/server`    | Registers the webhook-subscribable event descriptions at boot.                                                                          |
| `SecretsEvents`                | `@monark/secrets/contracts` | The domain-event union.                                                                                                                 |

## Data model

`Secret` (owned here; `// ── MODULE: secrets ──` banner in
`packages/db/prisma/schema.prisma`, migration `20260728130000_add_secrets`):

`id`, `organizationId` (FK → `Organization`, `onDelete: Cascade`), `key`,
`valueCipher` / `valueIv` / `valueTag` (`Bytes`), `description?`, `createdBy`
(user id), `lastUsedAt?`, `createdAt`, `updatedAt`. Unique `(organizationId,
key)`; indexed on `organizationId`.

## Events emitted

- `secrets.created` — a new secret was created. Carries `organizationId`, `key`,
  `actorId`. **No value.**
- `secrets.updated` — an existing secret's value/description changed. Same fields.
- `secrets.deleted` — a secret was deleted. Same fields.

Consumes none.

## tRPC surface

- `secrets.adminList` (query, `secrets.read`) → `SecretSummary[]` for the active org.
- `secrets.adminSet` (mutation, `secrets.manage`) → `{ key, created }`; upserts on
  `(org, key)`, emits `secrets.created` or `secrets.updated`.
- `secrets.adminDelete` (mutation, `secrets.manage`) → `{ key, deleted }`; emits
  `secrets.deleted` when a row was removed.

## Environment

- `SECRETS_ENCRYPTION_KEY` — 32 bytes hex-encoded (64 chars). Generate with
  `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
  Registered (optional) in `services/api/src/lib/env.ts`; validated lazily at
  first set/read.
