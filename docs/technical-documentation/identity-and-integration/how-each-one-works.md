# How each one works

### Secrets ; the outbound credential store

A per-organization encrypted `key` to `value` store. `Secret` carries `organizationId`, `key`, the
AES-256-GCM `valueCipher` / `valueIv` / `valueTag` triple, `description`, `createdBy` and `lastUsedAt`,
unique on `(organizationId, key)` and keyed by `SECRETS_ENCRYPTION_KEY` (deliberately separate from
`TOTP_ENCRYPTION_KEY`, so a leak of one does not expose the other).

It is **write-only over the wire**. There is no read-value tRPC procedure at any permission level ;
`secrets.read` grants names and metadata, `secrets.manage` grants set and delete, and neither returns a
value. Plaintext is resolved server-side only, on the trusted automation node path, through
`ctx.getSecret(name)`, which is scoped to the **run's organization**. A node's stored config holds the
secret's _name_, never its value, so a persisted run step never contains plaintext.

Full detail: [`secrets.md`](../secrets/_index.md).

### API keys ; the inbound credential

`ApiKey` carries `organizationId`, `ownerUserId`, a unique SHA-256 `tokenHash`, a display `prefix`,
`fullAccess`, a `permissions` array, and optional `expiresAt` / `revokedAt`. The token is minted
`mrk_`-prefixed and shown exactly once.

Two properties matter more than the rest:

1. **A key is pinned to one organization and owned by a principal.**
2. **Its authority is not a parallel scope taxonomy ; it is the owner's live RBAC**, re-evaluated on
   every request inside the same tRPC procedures the web app uses. The public API is a facade over a
   tRPC caller factory, so validation, permission checks and event emission are reused verbatim rather
   than reimplemented.

`fullAccess: false` adds an optional **ceiling**: an allowlist that can only ever narrow the owner's
authority, never widen it, and that caps an admin owner too. It is checked in the route mount before the
caller runs. Least privilege is therefore either a narrow role on the principal, or a personal key
restricted to a subset of your own permissions, or both.

Authentication rejects a key that is revoked, expired, unknown, or whose **owner is disabled or
deleted**. Take a role away from the owner and every one of their keys shrinks on the next request.

### Service accounts ; the machine identity

The answer to "an integration needs an identity, but there is no human behind it."

There is **no separate table**. A service account is a core `User` with `kind = SERVICE`, an id prefixed
`svc_` (deliberately never a valid Supabase auth subject, so it can never back a real session), an
`@service.invalid` email (RFC 2606 reserved, never deliverable, never colliding with a signup), an
organization membership, and **its own role grants**.

That is the whole trick, and it is why the public API needed no special-casing: because a machine
principal _is_ a `User`, it flows through RBAC, the caller factory, notification suppression (dispatch
short-circuits on `kind = SERVICE`) and API-key ownership unchanged. Disabling one instantly invalidates
every key it owns, with no per-key revoke.

### Webhooks ; outbound event delivery

`WebhookEndpoint` (org-scoped, or platform-tier when `organizationId` is null) plus
`WebhookSubscription` (exact or prefix match on an event type) plus `WebhookDelivery` (the outbox, with
a unique idempotency key and a backoff schedule) plus `WebhookDeliveryAttempt`.

A wildcard subscriber matches every emitted event against subscriptions and enqueues one delivery per
matching endpoint. A 5s worker POSTs it with `Webhook-Signature: v1=<hmac-sha256>` computed over
`<timestamp>.<body>` (the timestamp is inside the signed input, which is what bounds replay), retries
with exponential backoff to a 5-attempt limit, and auto-disables an endpoint after 5 consecutive
failures.

The event bus itself ([`architecture.md`](../architecture/_index.md)) is in-process, in-memory and best-effort,
with no persistence and no retry. **Webhooks is where durability lives.** That is why its subscriber is
registered _last_ at api boot, after automation's: its outbox write is the final handler.
