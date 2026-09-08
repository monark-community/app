# Identity & integration ; how webhooks, secrets, API keys and service accounts relate

Four primitives let Monark talk to the outside world and let the outside world talk back. Each is
documented on its own (or, in three of the four cases, was not documented at all before this file), but
nothing explained how they **compose**. That is what this doc is for.

It describes shipped behavior only. Per-module detail lives in each package's `README.md` ;
[`secrets.md`](secrets.md) is the deep-dive on the secret store, and
[`platform-overview.md`](platform-overview.md) is the single as-is reference for the whole platform.

## The one-sentence version of each

| Primitive                                                              | The question it answers                                         | Direction                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------- |
| **Secrets** ([`@monark/secrets`](../../packages/secrets/README.md))    | "How does _Monark_ prove who it is to someone else's system ?"  | Monark to outward ; a credential |
| **API keys** ([`@monark/api-keys`](../../packages/api-keys/README.md)) | "How does _someone else_ prove who they are to Monark ?"        | Outward to Monark ; a credential |
| **Service accounts** (same module)                                     | "_Whose_ permissions does a machine caller have ?"              | An identity, not a credential    |
| **Webhooks** ([`@monark/webhooks`](../../packages/webhooks/README.md)) | "How does someone else find out that something happened here ?" | Monark to outward ; events       |

Two axes, then: **direction** (who initiates) and **kind** (a credential versus an identity versus an
event stream). Laid out that way the whole surface fits in one table.

## The 2x2

|                        | **They call us** (inbound)                                                                                                                                                                 | **We call them** (outbound)                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Request / response** | An **API key** on `Authorization: Bearer mrk_...` hits `/api/v1`, resolves to a **principal** (a human `User` or a **service account**), and that principal's live RBAC decides everything | An **automation action node** calling out through `safeFetch`, authenticating with a value pulled from **Secrets** via `ctx.getSecret(name)`                    |
| **Event push**         | **Inbound hooks** ; `POST /hooks/automation/:id` (per-automation `atrig_` secret), `/hooks/github/:org` (HMAC), `/hooks/telegram/:org` (header echo). Each fires an **automation**         | **Webhooks** ; a domain event reaches the wildcard subscriber, lands in the `WebhookDelivery` outbox, and is POSTed signed with that endpoint's `whsec_` secret |

**Automation is the thing in the middle.** It is triggered by events (from the in-memory bus, or from an
inbound hook), it acts using secrets, and it runs _as_ a principal. Every one of the four primitives is
either an input to it or a sibling of it. See [`automation.md`](automation.md).

## How each one works

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

Full detail: [`secrets.md`](secrets.md).

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

The event bus itself ([`architecture.md`](architecture.md)) is in-process, in-memory and best-effort,
with no persistence and no retry. **Webhooks is where durability lives.** That is why its subscriber is
registered _last_ at api boot, after automation's: its outbox write is the final handler.

## The relationships, drawn

```
                domain event on the in-memory bus (best-effort, no durability)
                               |
          +--------------------+--------------------+
          |                                         |
 automation subscriber (first)            webhook subscriber (last)
          |                                         |
   AutomationRun outbox                     WebhookDelivery outbox
   worker 5s, 3 attempts                    worker 5s, 5 attempts
          |                                         |
   actor = Automation.createdBy             signed with whsec_ from SecretStore
          |                                    (NOT @monark/secrets)
          v
   ctx.getSecret(name) --> Secret (organizationId, key), AES-256-GCM
          |                        ^
          +-- safeFetch --> out    |  same store, fixed well-known keys
                                   |
  POST /hooks/{github,telegram}/:org  (inbound integration signing keys)


  Authorization: Bearer mrk_... --> ApiKey --> owner User (HUMAN | SERVICE)
                    |                                  |
                    |                            RoleAssignment --> RBAC
                    +-- fullAccess / permissions ceiling ---^
```

## Four things that are true and not obvious

1. **Secrets is the shared credential substrate for automation nodes _and_ for inbound integration
   signing keys** (GitHub, Telegram), but **not** for outbound webhook signing, which uses its own
   swappable `SecretStore` seam (see [`webhook-secret-resolver.md`](webhook-secret-resolver.md)).
2. **Automation and Webhooks are siblings, not layers.** Two wildcard subscribers, two outbox tables,
   two workers, and duplicated org-routing logic. Neither is built on the other.
3. **API keys and service accounts are one thing seen from two ends**: the credential, and the identity
   it belongs to.
4. **Automation and API keys never meet.** An automation cannot act as a service account ; a service
   account cannot own an automation.

## Choosing between them

| You want to...                                         | Use                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| Let a script read or write records                     | An **API key**, owned by the human if it is personal tooling       |
| Let a _shared_ integration read or write records       | A **service account** with a narrow role, plus a key it owns       |
| Let a flow post to Slack / GitHub / an internal API    | An **automation action node** plus a **secret** for the credential |
| Tell an external system that something changed here    | A **webhook** endpoint subscribed to the event types               |
| Let an external system tell _Monark_ something changed | An **inbound hook** on an automation with an HTTP trigger          |
| Store a non-sensitive, readable setting                | Nothing today ; see the gaps below                                 |

## Known gaps

Recorded here so the model is honest about its edges.

- **Secrets are per-organization only.** The unique key is `(organizationId, key)` and `createdBy` is
  attribution that plays no part in resolution, so two members holding `secrets.manage` silently
  overwrite each other's `GITHUB_TOKEN`. Each integration module reads a fixed well-known key, so an org
  gets exactly one GitHub connection, one bot token, one Twitter app. There is no per-user credential.
- **`ctx.getSecret` is org-scoped, not actor-scoped.** Any node in any flow in the org can read any of
  that org's secrets, regardless of who owns the flow or whether they hold `secrets.read`.
- **The automation actor is a snapshot of the author, not a principal.** `Automation.createdBy` is
  copied to the run at enqueue time and becomes `actorUserId`, so a flow runs as whoever _wrote_ it, not
  whoever triggered it. The field has no FK, `AutomationRun.createdBy` is nullable, and the null
  propagates into every node, so privileged nodes fail at run time (not author time) once the author is
  gone. There is no liveness check, unlike `authenticateApiKey`, which rejects a disabled or deleted
  owner ; and a service account cannot own an automation, so the natural fix is unreachable.
- **Two parallel secret mechanisms.** Webhook signing keys live in a swappable `SecretStore` whose
  **default implementation is in-memory**, so an api restart un-arms signing for every endpoint until
  each is rotated. The worker logs "no plaintext secret available" and the endpoints then auto-disable
  after 5 failures. The env-var-backed resolver that fixes this is specified in
  [`webhook-secret-resolver.md`](webhook-secret-resolver.md) and open in
  [the backlog](../todo/backlog.md).
- **There is no in-app environment or configuration concept.** Environment variables are deploy-time
  only (`render.yaml`, Vercel) ; see [`environments.md`](environments.md). They are operator-only, not
  org-editable, not permissioned, and invisible to an automation author. Secrets are the only in-app
  key/value store and are write-only by design, which is correct for credentials and wrong for
  non-sensitive settings.
- **No admin visibility into human users' API keys.** Personal keys live at `/account/api-keys` and
  there is no `/admin/api-keys`, so an admin cannot enumerate or revoke a departing employee's keys
  short of deleting the user.
- **The webhook delivery worker uses raw `fetch`, not `safeFetch`.** The SSRF guard runs at
  endpoint-create time only, so a hostname re-pointed at an internal address after creation is not
  caught at delivery.
- **A key's `permissions` ceiling has no referential integrity.** It stores dotted strings with no link
  to the permission registry, so a renamed or removed permission leaves a stale allowlist entry that
  silently denies.

## Where to read more

- [`secrets.md`](secrets.md) ; the secret store, crypto, and the node read path.
- [`automation.md`](automation.md) and [`automation-data-flow.md`](automation-data-flow.md) ; the engine,
  triggers, node registry, and how values move between steps.
- [`webhook-secret-resolver.md`](webhook-secret-resolver.md) ; the pluggable signing-secret seam.
- [`architecture.md`](architecture.md) ; the event bus and module boundaries.
- [`environments.md`](environments.md) ; deploy environments and the branch-to-environment mapping.
- Package READMEs: [`@monark/secrets`](../../packages/secrets/README.md),
  [`@monark/api-keys`](../../packages/api-keys/README.md),
  [`@monark/webhooks`](../../packages/webhooks/README.md),
  [`@monark/public-api`](../../packages/public-api/README.md).
- User-facing: [the public API guide](../user-guide/public-api.md) and
  [the admin guide](../user-guide/admin.md).
