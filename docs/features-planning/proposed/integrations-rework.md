# Coherent integration and identity

> Phase E of the integration program.
>
> **Source**: transcribes the approved program plan of 2026-09-07, re-verified against the code on
> 2026-09-10. Where this doc goes beyond the plan it says so.

## Context

Four shipped pieces cover integration, each good on its own and none aware of the others:

- **`@monark/webhooks`** (core) ; operator-configured **outbound** subscriptions to domain events,
  with a durable at-least-once outbox, retries, delivery log, and a pluggable signing-secret
  resolver. Administered at `/admin/webhooks`.
- **`@monark/secrets`** (core) ; per-org AES-256-GCM encrypted `key -> value`, **write-only** over
  tRPC, read by `getSecretValue` and automation's `ctx.getSecret`. Administered at `/admin/secrets`.
- **`@monark/automation`** (core) ; the node graph, the `webhook` action node, the `http-trigger`.
- **`@monark/integration-kit`** plus github / discord / telegram / twitter ;
  `defineInboundWebhook`, `createRestClient`, `makeConnectionSecretRouter`.

An operator has to visit `/admin/webhooks`, `/admin/secrets`, `/admin/automation` and `/automation`
to reason about one integration, and several real gaps sit between them.

## The locked decision

**Unify the operator surface and the mental model ; keep the engines where they are.**
`@monark/webhooks` continues to own the outbox, the delivery worker, signing and retry. **Nothing is
rewritten.** What changes is where an operator finds it and what concepts exist.

## Goals

- **A readable configuration store**, because secrets are write-only by design and configuration is
  not.
- **Per-user credentials**, so "my GitHub token" works per person.
- **An automation's actor is a real, live principal**, which is the most load-bearing gap in the
  whole integration story.
- **One integrations home**, under `/automation` rather than scattered across `/admin`.
- **The hardening that rides along**, closing four open backlog and audit items.

## Non-goals

- **Rewriting the webhook outbox or the delivery worker.**
- **OAuth authorization-code flows per connection.** Credentials are stored, not minted. The
  [social sign-in work](../../technical-documentation/social-sign-in.md) is user sign-in, a different
  thing.
- **"Run as whoever triggered the event."** Deliberately excluded: it would make a flow's authority
  vary per run and could let a low-privilege user's action execute high-privilege nodes. The owner
  model plus service accounts covers the real need.

## E.1 Documentation first

Already **shipped**: [identity-and-integration](../../technical-documentation/identity-and-integration/_index.md)
landed as PR #53, and the docs audit of `2026-09-08` closed the platform-overview drift. The
remaining doc gaps the exploration found are still open and still cheap, since they document shipped
behavior and block nothing:

| Doc                                | Covers                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `webhooks.md` (technical)          | models, subscriber routing, the signature scheme, retry and auto-disable, the admin UI  |
| `api-keys-and-service-accounts.md` | `ApiKey`, the ceiling, `UserKind.SERVICE`, the `svc_` id contract, principal resolution |
| `public-api.md` (technical)        | `V1_ROUTES`, the caller-factory facade, the `mcp` visibility decision, rate limiting    |
| `environment-variables.md`         | the actual catalog, derived from `services/api/src/lib/env.ts`                          |

## E.2 Configuration variables ; the missing non-secret store

Secrets are write-only _by design_, which is right for credentials and wrong for configuration. A
sibling model in the secrets module: same package, same admin surface, different semantics.

```prisma
/// Org-scoped, readable configuration values. The non-sensitive counterpart to
/// Secret : same shape, no encryption, and a real read path.
model ConfigVariable {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  key            String
  value          String
  description    String?
  createdBy      String
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([organizationId, key])
  @@index([organizationId])
}
```

- New permissions `secrets.read-variables` / `secrets.manage-variables`. Reading a _value_ is a real
  permission here, unlike secrets.
- Automation reaches them through a new **`ctx.getVariable(name)`** on `NodeExecutionContext`, wired
  in `engine.ts` next to `getSecret`, plus a `{{ config.<KEY> }}` interpolation namespace.
- **Naming hazard, worth handling deliberately**: automation already has _workflow_ variables (the
  `set-variable` node, `{{ vars }}`) which are run-scoped. These are org-scoped and persistent. The
  UI calls them **Configuration**, not "variables", and the docs draw the line explicitly.
- Unlike a secret, a variable's value **may** be returned as node output and logged.

## E.3 Per-user credentials

Widen `Secret` with a nullable owner:

```prisma
  // Null = an org-wide secret (today's behavior). Non-null = a personal
  // credential, resolvable only when that user is the acting principal.
  userId String?
  @@unique([organizationId, userId, key])
```

Postgres treats nulls as distinct in a unique index, so the existing `@@unique([organizationId, key])`
must be replaced by a **partial** unique index on `(organizationId, key) WHERE "userId" IS NULL`
alongside the three-column unique. That needs a hand-written migration (`--create-only`, then strip
the spurious `DROP INDEX DataRecord_data_gin` the generator folds in ; see
[schema-changes](../../agents/schema-changes.md)).

Resolution order in `getSecretValue(organizationId, key, actorUserId?)`: the actor's own secret
first, then the org-wide one. `ctx.getSecret` passes `ctx.actorUserId`. Every existing org secret and
call site behaves identically.

**This depends on E.4**: a per-user credential is only correct if the run's actor is a real, live
principal.

## E.4 Automation actor as a principal

The most load-bearing gap in the integration story.

1. **Liveness.** Before a run executes, resolve `actorUserId` through `getById` and fail the run with
   a clear error if the user is `disabledAt` or `deletedAt`, mirroring exactly what
   `authenticateApiKey` already does for keys. **Today a disabled user's automations keep running as
   them.**
2. **An explicit, settable owner.** Add `Automation.runAsUserId String?` (falling back to `createdBy`
   when null) and a "Run as" control in the editor, restricted to service accounts the caller may use
   plus the caller themselves. This is what lets an integration flow be owned by a `svc_` principal
   that outlives any employee.
3. **Warn at author time, not run time.** `automations.getById` returns an `ownerStatus`
   (`ok | missing | disabled | insufficient`) so the editor shows a banner before the flow silently
   breaks. `insufficient` re-checks the privileged nodes' permissions against the current owner.
4. **Provenance.** Stamp emitted events with `via: { automationId, runId }` on `DomainEventBase`, so
   an automation-caused change is distinguishable downstream. Today it is indistinguishable from a
   human action, which makes both audit and loop detection harder ; the
   [materialization write-back](views-system.md) makes that concrete.

## E.5 One integrations home

`/automation` gains a secondary nav: **Flows | Connections | Webhooks | Configuration | Secrets |
Keys**.

`services/web/src/app/(authed)/automation/layout.tsx` is currently a **bare permission gate**
returning `<>{children}</>` ; it does not mount `SectionShell`. So this step is also where
`/automation` adopts `SectionShell` plus an `automation-tabs.ts` mirroring `admin-tabs.ts`. Do it
once here, and [Phase C](workspace-unification.md) inherits the pattern.

- **Flows** ; today's `/automation` list and React Flow editor. Unchanged.
- **Connections** ; today's `/admin/automation` (the per-provider `makeConnectionSecretRouter`
  surfaces). Already automation-owned and mis-filed under `/admin` ; moving it is a pure route
  change.
- **Webhooks** ; today's `/admin/webhooks`, moved. Module, models, worker and permissions untouched.
- **Configuration** ; E.2.
- **Secrets** ; today's `/admin/secrets`, moved, now showing org-wide and personal scopes (E.3).
- **Keys** ; the union of `/account/api-keys` (personal), `/admin/service-accounts`, and a **new
  admin view of every key in the org**. Today an admin cannot enumerate or revoke a departing
  employee's keys short of deleting the user. New permission `api-keys.manage-org-keys`.

The `webhooks`, `automation` and `secrets` tabs are removed from `ADMIN_TABS` ;
`/admin/service-accounts` stays reachable from both. **Every moved route ships a redirect** so
existing links and the docs do not rot. (Note the contrast with
[Phase C](workspace-unification.md), where the operator's explicit call was _no_ shims ; these are
admin routes with a much smaller external surface, and the plan calls for redirects here.)

## E.6 Hardening that rides along

- **Swap the webhook delivery worker's default `fetchImpl`** (currently the global `fetch`,
  `packages/webhooks/src/server/worker.ts:83`) for `safeFetch` from `@monark/common/http`, so the
  DNS-resolution guard runs at **delivery** time and not only at endpoint-create time. Keep the
  injectable parameter for tests.
- **Ship the `WEBHOOK_SECRETS` env-var-backed resolver** already specified in
  [webhook-secret-resolver](../../technical-documentation/webhook-secret-resolver/_index.md) and
  already open in [the backlog](../../todo/backlog.md#webhooks), so a restart does not silently
  un-arm signing on single-tenant deploys.
- **A `check:` gate asserting every `ApiKey.permissions` entry and every `RolePermission` row names a
  registered permission**, so a renamed permission surfaces at CI rather than as a silent deny.

## Beyond the plan: two open proposals

Neither is part of the approved program ; both are recorded here so they are not re-derived.

- **A generic `Connection` entity.** Today the automation `webhook` node's config is
  `{ url, method, body }` with **no headers and no auth**, so calling any authenticated API from a
  flow requires writing a module ; and each integration hardcodes its secret key name
  (`TELEGRAM_BOT_TOKEN_KEY`, `GITHUB_WEBHOOK_SECRET_KEY`, four `TWITTER_*`), so one org cannot hold
  two GitHub connections. A named `Connection` (base URL, auth by _reference_ to a secret, default
  headers) would fix both, with the integrations' constants becoming per-provider defaults. This is
  additive to E.5's Connections tab rather than a replacement for it.
- **A branded `SecretValue`.** "A secret value never leaves a node as output" is enforced today only
  by a convention comment in `registry.ts`. Returning an opaque branded type from `ctx.getSecret`,
  unwrappable only at the header-building seam and refused by the run-step serializer, makes it
  structural. The cost is that it breaks every current caller across four integration modules, which
  is the point but also the schedule risk.

## Open audit items this phase touches

From the `2026-07-29` audit, still open:

- **HTTP-trigger replay and rate limiting**, and comparing the secret **before** `parseGraph` (today
  an unauthenticated caller who guesses an automation id forces a graph parse per request).
- **Per-endpoint webhook rate limiting**, using the shared Postgres token bucket
  (`@monark/common/rate-limit`, `RateLimitBucket`) that already exists for API keys.
- **Delivery log export** (CSV or JSON), open since `2026-05-08`.
- **Whether `automation.secrets.list` should gate on `secrets.read`.** It returns secret _names_
  under `automation.view`, a deliberate widening. Acceptable as-is ; a "used by" column makes the
  exposure visible rather than narrowing it.

## Sequencing

`E.1` is independent and mostly done. `E.2` is independent. `E.4` blocks `E.3`. `E.5` comes after
`E.2` so the section is not half-empty. `E.6` is independent.

## Edge cases and risks

- **The `Secret` unique-index migration** is the riskiest schema change here ; a partial unique plus
  a three-column unique, hand-written, on a table holding credentials. Rehearse on staging.
- **Naming collision** between run-scoped `{{ vars }}` and org-scoped `{{ config }}`. The UI naming
  ("Configuration") is the mitigation, and it only works if the docs and the editor agree.
- **Failing runs whose owner is disabled** is a behavior change that will surface as "my automations
  stopped". It is correct, and it needs a changelog note and the author-time banner (E.4.3) landing
  in the same release, not after.
- **Moving admin routes** breaks deep links in existing notification emails and runbooks ; the
  redirects are what make that survivable, which is why they are kept here even though Phase C drops
  its own.

## Success metrics

- Configuration has a readable store with a real read permission.
- A personal credential resolves for its owner and the org-wide one still resolves for everyone else.
- A disabled owner's automations fail with a clear error instead of executing as them.
- An operator reasons about an integration from one section.
- A webhook delivery to a host that resolves privately is refused at delivery time.
