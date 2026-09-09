# Identity & integration ; how webhooks, secrets, API keys and service accounts relate

Four primitives let Monark talk to the outside world and let the outside world talk back. Each is
documented on its own (or, in three of the four cases, was not documented at all before this file), but
nothing explained how they **compose**. That is what this doc is for.

It describes shipped behavior only. Per-module detail lives in each package's `README.md` ;
[`secrets.md`](../secrets/_index.md) is the deep-dive on the secret store, and
[`platform-overview.md`](../platform-overview/_index.md) is the single as-is reference for the whole platform.

## In this section

- **[The one-sentence version of each](the-one-sentence-version-of-each.md)**
- **[The 2x2](the-2x2.md)**
- **[How each one works](how-each-one-works.md)**
- **[The relationships, drawn](the-relationships-drawn.md)**
- **[Known gaps](known-gaps.md)**

## Four things that are true and not obvious

1. **Secrets is the shared credential substrate for automation nodes _and_ for inbound integration
   signing keys** (GitHub, Telegram), but **not** for outbound webhook signing, which uses its own
   swappable `SecretStore` seam (see [`webhook-secret-resolver.md`](../webhook-secret-resolver/_index.md)).
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


## Where to read more

- [`secrets.md`](../secrets/_index.md) ; the secret store, crypto, and the node read path.
- [`automation.md`](../automation/_index.md) and [`automation-data-flow.md`](../automation-data-flow/_index.md) ; the engine,
  triggers, node registry, and how values move between steps.
- [`webhook-secret-resolver.md`](../webhook-secret-resolver/_index.md) ; the pluggable signing-secret seam.
- [`architecture.md`](../architecture/_index.md) ; the event bus and module boundaries.
- [`environments.md`](../environments/_index.md) ; deploy environments and the branch-to-environment mapping.
- Package READMEs: [`@monark/secrets`](../../../packages/secrets/README.md),
  [`@monark/api-keys`](../../../packages/api-keys/README.md),
  [`@monark/webhooks`](../../../packages/webhooks/README.md),
  [`@monark/public-api`](../../../packages/public-api/README.md).
- User-facing: [the public API guide](../../user-guide/public-api/_index.md) and
  [the admin guide](../../user-guide/admin/_index.md).
