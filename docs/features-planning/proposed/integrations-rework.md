# Integrations rework ; connections, secrets and webhooks in one place

## Context

Four shipped pieces cover outbound and inbound integration, and each is good on its own:

- **`@monark/webhooks`** (core): operator-configured **outbound** subscriptions to domain events,
  with a durable at-least-once outbox, retries, delivery log, and a per-endpoint signing secret
  resolved through a pluggable resolver. Administered in `/admin/webhooks`.
- **`@monark/secrets`** (core): per-org, AES-256-GCM encrypted `key -> value` store, write-only over
  tRPC, consumed by `getSecretValue` and by automation's `ctx.getSecret`. Administered in
  `/admin/secrets`.
- **`@monark/automation`** (core): the node graph, with a `webhook` action node, an `http-trigger`
  for inbound calls, and `ctx.getSecret`.
- **`@monark/integration-kit`** (library) + the four integration modules (github, discord, telegram,
  twitter): `defineInboundWebhook`, `createRestClient`, `makeConnectionSecretRouter`.

They are good on their own and they do not compose. The seams show in concrete ways:

1. **The automation `webhook` node cannot authenticate.** Its config is `{ url, method, body }`;
   no headers, no auth, no secret. Calling any real API from a flow is therefore impossible
   without writing a module. `ctx.getSecret` exists but the node does not use it, and the
   [structural rule](../../todo/backlog.md#security-audit-follow-ups) that a secret must never leave
   a node as output is enforced only by a comment.
2. **Secret key names are hardcoded per integration.** `TELEGRAM_BOT_TOKEN_KEY`,
   `GITHUB_WEBHOOK_SECRET_KEY`, four `TWITTER_*` constants. One org cannot hold two GitHub
   connections, and the name is a convention rather than a modelled thing.
3. **Configuration is three screens away from use.** An automation author picking a secret in the
   editor cannot create one there; they leave for `/admin/secrets` and come back. Same for a
   webhook endpoint.
4. **Inbound and outbound are unrelated systems.** `@monark/webhooks` sends; `defineInboundWebhook`
   and `http-trigger` receive; neither knows the other exists, and an operator debugging "did the
   call happen" looks in two different logs.
5. **Open hardening items** from the `2026-07-29` audit are still open and all live at this seam:
   HTTP-trigger replay and rate limiting (and the secret compare running _after_ `parseGraph`), the
   default env-var webhook secret resolver, per-endpoint rate limiting, delivery-log export.

## Goals

- **A `Connection` is a first-class, named thing**: a configured link to an external service,
  holding its base URL, its auth (by reference to a secret, never inline), its default headers, and
  its inbound endpoint if it has one.
- **The automation `webhook` node calls a connection**, or a raw URL, with headers and auth ; so a
  flow can talk to any API without a module.
- **Secrets are pickable and creatable in place**, wherever they are consumed.
- **One integrations surface** in admin, listing connections, their inbound endpoints, and their
  recent traffic, both directions.
- **Secret values are structurally prevented from leaving a node**, rather than by convention.
- **Close the audit items** listed above, since they are all this seam's hardening.

## Non-goals

- **OAuth-per-connection authorization flows.** Connections hold tokens, they do not mint them. The
  [OAuth work that shipped](../../../CHANGELOG.md) is user sign-in, a different thing. An OAuth
  connection type is the obvious follow-up and is named under Out of scope.
- **Replacing `@monark/webhooks`' outbox.** The delivery machinery is sound; it gains a connection
  reference and rate limiting, not a rewrite.
- **A visual HTTP request builder.** The node gains headers and auth, not a Postman.

## User stories

- **As an admin**, I add a connection called _Stripe_, paste its API key (stored as a secret, never
  shown again), set its base URL, and save.
- **As an automation author**, I drop a Webhook node, pick _Stripe_, type `/v1/customers`, and the
  auth header is applied without me handling the key.
- **As an automation author**, I need a token that does not exist yet ; I create it from the node's
  secret picker without leaving the editor.
- **As an admin**, I open **Integrations** and see every connection, whether it is reachable, its
  inbound endpoint URL, and its last twenty deliveries in and out.
- **As an operator**, a receiver returning 429 slows that endpoint's queue instead of hammering it,
  and a replayed inbound call is rejected.
- **As a security reviewer**, I can point at the code that makes a secret value unable to appear in
  a run's step output.

## Data model

One new core table, in `@monark/secrets`' banner (it is the module that already owns the
credential relationship) or a new `@monark/connections` core module if the surface grows; start in
secrets, since a connection is mostly "a secret with a destination".

```prisma
model Connection {
  id             String   @id @default(cuid())
  organizationId String
  // Stable machine name, unique per org. Referenced by automation node config,
  // so it is immutable after create (renaming is a `label` edit) ; the same
  // rule DataModel.key follows.
  key            String
  label          String
  // The provider this connection is for : a registered connection type
  // ("http" for a generic API, or an integration's key like "github").
  provider       String
  baseUrl        String?
  // Auth by reference. The secret's VALUE is never stored here and never
  // crosses tRPC ; only the pointer does.
  authKind       ConnectionAuthKind   // NONE | BEARER | HEADER | BASIC | QUERY
  authSecretKey  String?              // -> Secret.key, same org
  authParam      String?              // header or query-param name for HEADER/QUERY
  defaultHeaders Json     @default("{}")
  // Inbound half, when the provider receives : the signing secret's key and
  // the mounted path. Null for outbound-only connections.
  inboundSecretKey String?
  enabled        Boolean  @default(true)
  createdBy      String
  …
  @@unique([organizationId, key])
}
```

The integrations' hardcoded key constants become **defaults** for a connection of that provider,
so `@monark/github` keeps working unchanged while gaining the ability to hold two connections.
`makeConnectionSecretRouter` in `@monark/integration-kit` becomes a thin wrapper over the
connection surface rather than a parallel implementation.

## The webhook node, rebuilt

```
url          text | connection + path
method       GET | POST | PUT | PATCH | DELETE
headers      key/value rows, values interpolatable
auth         inherited from the connection, or none
body         JSON, interpolatable (unchanged)
```

Auth resolution happens **inside the node's execute**, from the connection's `authSecretKey` via
`ctx.getSecret`, and the resolved header is never part of the node's input, output, or logged step.
`safeFetch` still guards the URL, so SSRF protection is unchanged and a connection's `baseUrl` is
validated the same way at save time.

### Making "a secret never leaves a node" structural

Today `ctx.getSecret` returns a plain string and discipline keeps it out of `output`. Replace it
with a branded wrapper:

```ts
type SecretValue = { readonly __secret: unique symbol };
ctx.getSecret(key): Promise<SecretValue>          // not a string
useSecret(v: SecretValue): string                  // only inside safeFetch's header builder
```

and have the run-step serializer refuse to serialize one (throw, do not redact silently ; a node
that tries is a bug to fix, not a value to mask). A node author physically cannot put it in
`output` without an explicit unwrap that is greppable and reviewable. This closes the
[audit item](../../todo/backlog.md#security-audit-follow-ups) that today rests on a comment in
`registry.ts`.

## Inbound: one endpoint model

`http-trigger` and `defineInboundWebhook` converge on one receiver contract:

- **Verify before parse.** `handleHttpTrigger` currently runs `parseGraph` _before_ the
  constant-time secret compare, so an unauthenticated caller who guesses an automation id forces a
  graph parse per request. Compare first. (Audit item.)
- **Replay protection.** Accept an idempotency key or a signed timestamp, and reject a delivery
  already seen inside the window. Without it, a captured valid request re-enqueues runs forever.
  (Audit item.)
- **Per-endpoint rate limiting**, using the shared Postgres token bucket
  (`@monark/common/rate-limit`, `RateLimitBucket`) that already exists for API keys, both on
  `/hooks/automation/:id` and, outbound, per webhook endpoint so a 429 pauses that endpoint's
  siblings instead of retrying past it. (Two audit items, one primitive.)
- **One delivery log** covering both directions, with the CSV/JSON export the backlog asks for.

## Admin surface

`/admin/integrations` replaces `/admin/webhooks` and `/admin/secrets` as the _entry point_
(both keep their screens as sub-tabs, since they are still distinct objects):

- **Connections** ; the list, with reachability, provider, and where each is used ("3 automations,
  1 inbound endpoint"). Deleting a connection in use is refused with the list, not with a warning.
- **Event subscriptions** ; today's `/admin/webhooks`, with an endpoint able to reference a
  connection instead of restating a URL and secret.
- **Secrets** ; today's `/admin/secrets`, unchanged in behaviour, plus a "used by" column, which is
  the single most requested thing about a write-only store.
- **Deliveries** ; the merged log, filterable by direction, connection and status, exportable.

Plus the in-editor pickers: a connection picker and a secret picker with create-in-place, both
gated on the same permissions as the admin screens, so an automation author without
`secrets.write` sees the picker without the create affordance.

## Default env-var secret resolver

The [oldest open item](../../todo/backlog.md#webhooks) here: ship a `WEBHOOK_SECRETS` JSON
env-var-backed resolver as the **default** implementation of the webhook secret resolver contract,
so a fresh single-tenant deploy signs its webhooks without integrating anything. With
`@monark/secrets` shipped, the better default is arguably "resolve from the secrets store, fall
back to the env var" ; decide and document in
[webhook-secret-resolver.md](../../technical-documentation/webhook-secret-resolver/_index.md).

## Phasing

1. **Node hardening** ; headers + auth on the `webhook` node, the branded `SecretValue`, verify
   before parse on the HTTP trigger. No schema change, immediate value, closes two audit items.
2. **Connections** ; the table, the CRUD, the pickers, the node's connection mode. Integrations
   keep their hardcoded keys as defaults.
3. **Rate limiting and replay** ; the shared bucket applied to both directions, idempotency keys,
   the merged delivery log and its export.
4. **Admin consolidation** ; `/admin/integrations`, the "used by" columns, and retiring the
   parallel `makeConnectionSecretRouter` implementation.

## Dependencies

- Shipped: `@monark/secrets`, `@monark/webhooks`, `@monark/automation`, `@monark/integration-kit`,
  `@monark/common/http` (`safeFetch`), `@monark/common/rate-limit`.
- Independent of the workspace program ; they touch no common files beyond `server.ts`.

## Edge cases and risks

- **A connection deleted while a run is in flight.** The run resolves the connection at execute
  time and fails the step with a clear error rather than a null-deref ; the outbox retry then
  surfaces it in the run log.
- **Interpolated headers.** `{{ trigger.* }}` inside a header value is useful and is also an
  injection surface (a CRLF in an interpolated value). Reject control characters at interpolation,
  not at config save, since the value is only known at run time.
- **`baseUrl` plus path traversal.** A node path of `../../` must not escape the connection's host.
  Resolve with the URL constructor against the base and reject a result whose origin changed.
- **Secret rotation.** Changing a secret's value must not require touching every connection;
  reference by key is what makes that true, and is why the connection stores a pointer rather than
  a copy.
- **The branded-type migration.** Changing `ctx.getSecret`'s return type breaks every current
  caller across four integration modules; that is the point, but it means phase 1 touches them all
  and needs their tests green before merge.
- **`automation.secrets.list` gating** stays as it is (names, never values, under `automation.view`)
  ; the open question in the backlog is answered by the "used by" column making the exposure
  visible rather than by narrowing it.

## Success metrics

- A flow can call an authenticated third-party API with no new module.
- No hardcoded secret key constant is load-bearing; each is a provider default.
- A secret value cannot be placed in a run step's output without an explicit, greppable unwrap.
- The four open audit items at this seam are closed.

## Out of scope

- **OAuth connections** (authorization-code flow, refresh handling, per-user tokens). The single
  largest follow-up, and the one that makes "connect your Google account" possible in a flow.
- **A connection health monitor** (scheduled reachability checks with alerting).
- **Per-connection quotas** beyond rate limiting.
