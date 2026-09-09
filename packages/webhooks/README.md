# @monark/webhooks

Operator-registered HTTP endpoints that receive a fan-out of every domain event the platform emits. Lives in tier `core` so any module can subscribe to events through the bus without touching webhooks ; the webhooks subscriber listens on the bus's `*` wildcard, matches against `WebhookSubscription` rows, and writes outbox rows in the same transaction as the source mutation.

## What's here

- `/contracts` — `WebhooksEvents` union (endpoint lifecycle + per-delivery outcome events), the HTTP header constants, and the worker tunables (`WEBHOOK_DELIVERY_FAILURE_LIMIT`, backoff caps, timeout).
- `/server` — the tRPC `webhooksRouter`, the data layer (`createEndpoint`, `enqueueDeliveries`, `listPendingDueDeliveries`, …), the HMAC signing helpers (`mintSecret`, `signBody`, `buildDeliveryHeaders`, `computeIdempotencyKey`), the wildcard subscriber (`registerWebhookSubscribers`), and the delivery worker (`startWebhookDeliveryWorker`, `tickOnce`, `deliverOne`).
- `/client` — placeholder.

## Lifecycle

```
   ┌──────────────────────────────┐
   │ source mutation runs         │
   │  ⇒ emit(domainEvent)         │
   └─────────────┬────────────────┘
                 │
   ┌─────────────▼────────────────┐
   │ event bus fans to wildcard   │
   │ subscribers ; webhooks one   │
   │ writes WebhookDelivery rows  │
   │ ─ one per matching endpoint  │
   │ ─ unique idempotency key     │
   └─────────────┬────────────────┘
                 │ (in-process worker on setInterval)
                 │ (cron sweep as external fallback)
   ┌─────────────▼────────────────┐
   │ deliverOne() :               │
   │   resolve plaintext secret   │
   │   sign body with HMAC-SHA256 │
   │   POST to endpoint URL       │
   │   record WebhookDeliveryAttempt │
   │   on 2xx ⇒ status='delivered'│
   │   on 4xx/5xx/timeout ⇒ retry │
   │     up to FAILURE_LIMIT ;    │
   │     exponential backoff      │
   │     past cap ⇒ status='failed'│
   │     + auto-disable endpoint  │
   └──────────────────────────────┘
```

## Module-namespace fit

The webhook subscriber matches every event whose `event.type` is in the registered subscriptions. Because the event-union is **generated** from the manifest by `pnpm gen:events`, an extended module's events become routable through webhooks the moment its `/contracts/events.ts` lands in `modules.manifest.ts` — no code change in `@monark/webhooks` required.

Subscriptions accept two shapes :

- **Exact** : `eventType = "rbac.role-assigned"`, `isPrefix = false`. Matches one event type only.
- **Prefix** : `eventType = "rbac."`, `isPrefix = true`. Matches every event whose type starts with the string. `eventType = ""` with `isPrefix = true` would match every event ; reserved for sysadmin platform-tier endpoints because it ignores the per-org filter.

## Routing semantics

Once an event matches an endpoint's subscription set, the subscriber walks three rules in order to decide whether to enqueue a delivery :

1. **Platform-tier endpoint** (`organizationId = null`) — receives every matching event regardless of payload shape. Use case : sysadmin / SIEM / audit-log integration that wants the firehose.
2. **Direct org match** — the event payload carries an `organizationId` and it equals the endpoint's. Use case : `organization.member-joined`, `organization.invite-sent`, `rbac.role-assigned` for an org-tier grant, `feature-flag.flipped` for an org-scoped override.
3. **Resolved org match** — the event payload carries no `organizationId`, so the org is worked out instead.
   - **From the user, when there is one.** A payload with a `userId` resolves to that user's active org memberships, looked up once per event, fanning out to every org-scoped endpoint whose org the user belongs to. Use case : `user.signed-in`, `user.signed-out`, `user.password-changed`, `totp.enabled`, `notification.created` — events that affect a user but aren't intrinsically tied to one of their orgs. Former members (rows with `leftAt` set) are excluded so a user's later events don't leak to an org they've left.
   - **From the singleton org otherwise.** With no user id — or a user whose membership row doesn't exist yet — the event is an instance-level fact : a global feature flag was flipped, a storage bucket was created, a platform-tier role was defined. In a deploy with exactly one non-deleted organization, that org is the only thing such a fact can belong to. This also covers brand-new accounts whose first sign-in fires before `@monark/organizations`'s auto-membership subscriber finishes its upsert, and deploys predating that subscriber with a populated `User` table and an empty `OrganizationMembership` one.

   With more than one org live there is no singleton to resolve to, the event stays genuinely ambiguous, and no org-scoped endpoint receives it — better than fanning one org's event out to every org.

Endpoints that match none of the rules are skipped silently — over-eager fan-out would surprise operators who explicitly scoped their endpoint to one org. Resolution only runs when (a) the event has no org id and (b) at least one org-scoped endpoint matched the event type ; otherwise no extra DB roundtrip fires.

The picker shows every event type uniformly, and operators don't have to know which routing rule fires for each — the rules are about how a subscription gets _delivered_ once it matches, not whether it can match at all.

> Rule 3's second half is what makes that promise true. Before it, an event with neither an org id nor a user id satisfied rule 1 only : it reached platform-tier endpoints and nothing else. An operator could scope an endpoint to their org, subscribe it to `feature-flag.flipped`, and silently receive nothing — no error, no delivery row, nothing anywhere to explain it.

## Signing

Every outgoing request carries five headers :

| Header                             | Value                                                |
| ---------------------------------- | ---------------------------------------------------- |
| `Webhook-Delivery-Id`              | the `WebhookDelivery.id`                             |
| `Webhook-Delivery-Idempotency-Key` | stable per (endpoint, event, correlationId)          |
| `Webhook-Event-Type`               | the source event's `type` field                      |
| `Webhook-Timestamp`                | unix seconds, recomputed per attempt                 |
| `Webhook-Signature`                | `v1=<hex hmac sha256(secret, "<timestamp>.<body>")>` |

Receivers verify by recomputing the HMAC over `<timestamp>.<body>` using their stored copy of the shared secret and a constant-time compare. Including the timestamp in the signed payload defeats replay attacks outside a tolerance window (suggested ±5 minutes). The `Webhook-Delivery-Idempotency-Key` lets a receiver dedupe retries without parsing the body.

The DB only persists the SHA-256 hash of the secret. Production deploys MUST register a plaintext-secret resolver via `setWebhookSecretResolver()` before the worker starts ; otherwise deliveries are recorded with a "no plaintext secret available" error on every attempt. The resolver is the integration seam for AWS Secrets Manager / Vault / sidecar-env-var deployments. **Step-by-step wiring with three concrete backing-store recipes (env-var JSON, per-endpoint env vars, AWS Secrets Manager) is in [docs/technical-documentation/webhook-secret-resolver.md](../../docs/technical-documentation/webhook-secret-resolver.md).**

## Permissions

Registered at api boot via `registerWebhooksPermissions()` :

| Slug             | Reads                                              |
| ---------------- | -------------------------------------------------- |
| `webhooks.read`  | View endpoints, subscriptions, delivery history.   |
| `webhooks.write` | Create / edit / delete endpoints + rotate secrets. |
| `webhooks.retry` | Manually retry a failed delivery.                  |

Org-scoped endpoints check the permission against the endpoint's `organizationId` ; platform-tier endpoints (`organizationId = null`) require the permission at the platform tier (sysadmins).

## Public API

| Import path                  | Export                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `@monark/webhooks/server`    | `webhooksRouter` (tRPC sub-router mounted at `webhooks.*`)                                |
| `@monark/webhooks/server`    | `registerWebhookSubscribers`, `registerWebhooksPermissions`                               |
| `@monark/webhooks/server`    | `startWebhookDeliveryWorker`, `stopWebhookDeliveryWorker`, `tickOnce`                     |
| `@monark/webhooks/server`    | `setWebhookSecretResolver`                                                                |
| `@monark/webhooks/server`    | data-layer helpers (`createEndpoint`, `enqueueDeliveries`, `listPendingDueDeliveries`, …) |
| `@monark/webhooks/contracts` | `WebhooksEvents`, header constants, worker tunables                                       |

tRPC procedures under `webhooks.*` :

| Procedure                 | Input                                                          | Output                                            |
| ------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| `webhooks.list`           | `{ organizationId: string \| null }`                           | `EndpointWithSubs[]`                              |
| `webhooks.get`            | `{ id }`                                                       | `EndpointWithSubs`                                |
| `webhooks.create`         | `{ organizationId, name, url, description?, subscriptions[] }` | `{ endpoint, secret }` (secret returned **once**) |
| `webhooks.update`         | partial of the create payload + `status`                       | updated endpoint                                  |
| `webhooks.rotateSecret`   | `{ id }`                                                       | `{ secret }` (new plaintext)                      |
| `webhooks.delete`         | `{ id }`                                                       | —                                                 |
| `webhooks.listDeliveries` | `{ endpointId, limit?, cursor? }`                              | `DeliveryRow[]`                                   |
| `webhooks.getDelivery`    | `{ id }`                                                       | `{ delivery, attempts }`                          |
| `webhooks.retryDelivery`  | `{ id }`                                                       | —                                                 |

## Boot wiring

The api process registers + starts everything in [`services/api/src/server.ts`](../../services/api/src/server.ts) :

```ts
registerWebhooksPermissions(); // permissions registry
registerWebhookSubscribers(); // bus → outbox writer
startWebhookDeliveryWorker(); // outbox → HTTP POST
// + POST /cron/sweep-webhook-deliveries as the external fallback
```

## Operational

### Cron fallback

External schedulers POST to `/cron/sweep-webhook-deliveries` with `Authorization: Bearer ${CRON_SECRET}`. Each call invokes `tickOnce()` once. Recommended cadence : every 1–5 minutes — the in-process worker handles steady state, the cron is for outage recovery.

### Auto-disable

After `WEBHOOK_DELIVERY_FAILURE_LIMIT` (5) consecutive failed deliveries — failure counts reset on the next success — the endpoint flips to `disabled` automatically and emits `webhook.endpoint-disabled-after-failures`. New deliveries stop accumulating ; pre-existing pending rows still drain so an outage doesn't lose already-queued events.

### Manual retry

`webhooks.retryDelivery` resets a `failed` row to `pending` and fires one delivery attempt inline so the operator gets immediate UI feedback. Subsequent attempts go through the worker as usual.

## Admin UI

Mounted under `/admin/webhooks` (added to [services/web/src/app/(authed)/admin/admin-tabs.ts](<../../services/web/src/app/(authed)/admin/admin-tabs.ts>)). Five surfaces :

- `/admin/webhooks` — endpoint list per scope (org or platform-tier), with URL search + status badges + "consecutive failures" warnings.
- `/admin/webhooks/new` — create form. Returns the plaintext signing secret in a copy-once banner ; once the operator leaves the page the only way to recover it is `Rotate secret`.
- `/admin/webhooks/[id]` — edit URL / description / subscriptions / status, plus `Rotate secret` and `Delete` affordances.
- `/admin/webhooks/[id]/deliveries` — paged delivery history (status, attempt count, last error).
- `/admin/webhooks/[id]/deliveries/[deliveryId]` — per-delivery inspection : full payload (JSON-pretty-printed), per-attempt audit log (HTTP code / network error / duration), and a manual `Retry now` button that fires one synchronous attempt inline.

All five pages are gated by the rbac `webhooks.read` (lists + inspection), `webhooks.write` (create / edit / delete / rotate), and `webhooks.retry` (manual retry) permissions registered at boot. The full surface is i18n'd in `en` + `fr`.

### Subscription picker

The create / edit form's subscription section is a categorized picker driven by the runtime event-type registry. Each module that emits domain events ships a `register<Module>EventTypes()` helper called at api boot ; the picker fetches the merged list via `webhooks.listEventTypes` and renders one collapsible group per module with :

- A tri-state header checkbox (`none` / `some` / `all`) for "tick every event in this module."
- A `selected/total` count chip on the right (e.g. `3 / 7`).
- One labeled checkbox row per event type, mono-font key + plain-language description.

Ticking the header writes a single **prefix subscription** when every event in the module shares a common dotted prefix (e.g. `rbac.role-assigned` + `rbac.role-revoked` collapse to `rbac.`), or **N exact subscriptions** when they don't (the auth module's events span `user.`, `trusted-device.`, and `totp.` prefixes, so its tri-state writes 11 exact rows). Server-side routing is uniform across both shapes.

Subscriptions an operator already saved that aren't in the current registry — usually a leftover from a deploy where a new module hadn't shipped its registration — surface as removable chips above the registry groups.

## URL scheme rules

The endpoint URL is **https:// only in production**. In development the validator also accepts **http://** for loopback (`localhost`, `127.0.0.1`, `[::1]`) and RFC 1918 private hosts (`10.x`, `172.16-31.x`, `192.168.x`), so you can point at a mock receiver on your dev machine or a sibling docker service without standing up a TLS proxy. Anything else (public host over http://, `file://`, `ws://`, missing scheme) is rejected at both the create + update tRPC procedures.

The same private-host shape gates the api's CORS layer in dev ([services/api/src/server.ts](../../services/api/src/server.ts)) so the two rules don't drift.

## Mock receiver + e2e

`tools/webhook-receiver.ts` is a standalone Node HTTP server that captures every incoming request to `/hook` + exposes a JSON `/inbox` for inspection. Use it for manual smoke testing :

```bash
pnpm webhook-receiver --port 4123
# Then in /admin/webhooks → New endpoint → URL = http://127.0.0.1:4123/hook
# Trigger any subscribed event ; the receiver prints the captured request to stdout.
# `curl http://127.0.0.1:4123/inbox` returns every captured request as JSON.
```

Flags :

- `--port <n>` — listening port (default 4123).
- `--secret <plaintext>` — turn on signature verification ; requests whose `Webhook-Signature` doesn't match are rejected with 401.
- `--fail-once` — return 500 for the first request, then accept normally. Lets you watch the retry path end-to-end.
- `--quiet` — silence stdout chatter (used by the e2e harness).

The e2e suite uses the receiver via [services/web/tests/e2e/helpers/webhook-receiver.ts](../../services/web/tests/e2e/helpers/webhook-receiver.ts) to spawn it in a child process, drive the admin UI, trigger an event, and assert the captured POST has the expected signature + idempotency + payload shape. Spec lives at [services/web/tests/e2e/admin-webhooks.spec.ts](../../services/web/tests/e2e/admin-webhooks.spec.ts) ; opt-in with `E2E_FULL_STACK=1`.

## Deferred follow-ups

- **Managed-secret-store adapters.** The env-var resolver (`makeEnvVarSecretResolver`, reading `WEBHOOK_SECRETS_JSON` + per-endpoint `WEBHOOK_SECRET_<id>`) and the dev file-backed store already ship ; adapters for AWS Secrets Manager / Vault / GCP / Azure behind `setWebhookSecretStore()` are the remaining follow-up.
- **Per-endpoint rate limiting.** A receiver under load returning 429 today retries with backoff but doesn't pause sibling deliveries to the same endpoint. A token bucket per endpoint would be kinder.
- **Receiver-side verification helper package.** A tiny `@monark/webhooks/verifier` that wraps the HMAC compare + timestamp tolerance for hand-rolled receivers.
- **Persisted event bus.** The in-memory bus loses events on a process crash _between_ `emit()` and the wildcard subscriber's outbox write. Today the window is the same Prisma transaction so the source-mutation rollback covers it ; if subscribers ever go async-after-commit we'd want a real outbox at the bus level.
- **Cursor pagination on the deliveries list.** Today the page shows the first 50 rows and stops ; a "Load more" button + the existing cursor support in `webhooks.listDeliveries` lands when actual deploys hit the limit.
