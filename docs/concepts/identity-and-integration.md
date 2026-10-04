---
type: concept
---

# Identity and integration

Webhooks, secrets, API keys and service accounts are how Monark exchanges data with other systems. Each answers a different question, and they line up on two axes: which side starts the conversation, and whether you're dealing with a credential, an identity or a stream of events.

| Piece            | The question it answers                                | Kind                |
| ---------------- | ------------------------------------------------------ | ------------------- |
| Secrets          | How does Monark prove who it is to another system?     | outbound credential |
| API keys         | How does another system prove who it is to Monark?     | inbound credential  |
| Service accounts | Whose permissions does a machine caller have?          | identity            |
| Webhooks         | How does another system learn that something happened? | outbound events     |

## Inbound and outbound

|                    | They call us (inbound)                                                                                                                                      | We call them (outbound)                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Request / response | An API key on `Authorization: Bearer mrk_…` calls `/api/v1`. It resolves to a principal (a person or a service account), and that principal's roles decide. | An automation action node calls out through the guarded fetch helper, authenticating with a value from Secrets. |
| Event push         | An inbound hook fires an automation: a per-flow HTTP trigger, or a GitHub or Telegram delivery verified against a signing secret.                           | A webhook endpoint receives each subscribed domain event, signed with that endpoint's own secret.               |

Automation sits in the middle. Events (from the in-app event bus or an inbound hook) trigger it, it acts using secrets, and it runs as a user. Every other piece is either an input to it or a sibling of it. See [how automations run](automations.md).

```
             domain event on the in-memory bus (best-effort)
                            |
         +------------------+------------------+
         |                                     |
  automation subscriber              webhook subscriber (registered last)
         |                                     |
  AutomationRun outbox                 WebhookDelivery outbox
  worker every 5s, 3 attempts          worker every 5s, 5 attempts
         |                                     |
  runs as the flow's author            signed with the endpoint's whsec_ secret
         |                             (webhook secret store, not Secrets)
  ctx.getSecret(name) --> Secrets (per org, AES-256-GCM)
         |                     ^
  safeFetch --> out            |  fixed keys per integration
                               |
  POST /hooks/{github,telegram}/:org   (inbound signing secrets)


  Bearer mrk_… --> API key --> owner (person or service account)
                     |                     |
                     |               role grants --> RBAC
                     +-- optional permission ceiling --^
```

## API keys and service accounts are one thing from two ends

An API key is the credential; a service account is one kind of identity that can own it. A key is pinned to one organization and owned by one principal.

A key has no scope system of its own. Its authority is its owner's roles, re-checked on every request inside the same procedures the web app calls: the public API is a thin layer over a server-side caller, so validation, permission checks and domain events are reused as they are. A key can also carry a ceiling, a list of permissions that only ever narrows what the owner could do. It caps an admin owner too.

Authentication rejects a key that is revoked, expired or unknown, or whose owner is disabled or deleted. Remove a role from the owner and every one of their keys loses it on the next request.

A service account is not a separate table. It's an ordinary user marked as a machine, with an id that can never back a real sign-in, a reserved email that can never receive mail, an organization membership and its own role grants. Because it's a user, it flows through permissions, API-key ownership and notifications (which skip machine users) with no special cases. Disabling one stops every key it owns.

Least privilege therefore comes from a narrow role on the principal, a ceiling on the key, or both. Public API routes today cover Data Models; the full list is in the [public API reference](../reference/public-api.md).

## Secrets are the credential store for integrations

Secrets is a per-organization, encrypted store of named values that can be written but never read back over the API. Automation nodes read a value server-side by name while they run. Integration modules use the same store for their inbound signing secrets (GitHub, Telegram) and their fixed credentials (the Telegram bot token, the Twitter app keys). Outbound webhook signing does not use it. How the store works and why it's safe: [Secrets](secrets.md).

## Webhooks are where durability lives

The event bus is in-process and best-effort: no persistence, no retry. The webhook module subscribes to every event and writes one delivery per matching endpoint to a database outbox, so it registers last at boot, after every other subscriber. A worker posts each delivery with a `Webhook-Signature: v1=<hmac-sha256>` header computed over the timestamp and the body, which bounds replay. It retries with exponential backoff up to five attempts, and an endpoint is turned off after five consecutive failures.

Each endpoint's signing secret lives in the webhook module's own pluggable secret store, separate from Secrets. Where that store keeps its values in production is an operator choice: [Choose a webhook secret store](../operate/choose-a-webhook-secret-store.md).

Automations and webhooks are siblings, not layers: two subscribers, two outboxes, two workers. Neither is built on the other.

## Choosing between them

| You want to…                                          | Use                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| Let a script read or write records                    | an API key, owned by you if it's personal tooling             |
| Let a shared integration read or write records        | a service account with a narrow role, plus a key it owns      |
| Let a flow post to Slack, GitHub or an internal API   | an automation action node, plus a secret for the credential   |
| Tell another system that something changed in Monark  | a webhook endpoint subscribed to the event types              |
| Let another system tell Monark that something changed | an automation with an HTTP trigger, or a GitHub/Telegram hook |

## Limits

- Secrets belong to the organization, not to a person. Two people who can manage secrets overwrite each other's values, and any node in any flow of the organization can read any of its secrets.
- Integrations with fixed keys (Telegram, Twitter, the GitHub and Telegram signing secrets) get one connection per organization.
- A flow runs as the person who wrote it, not the person who triggered it, and a service account can't own a flow.
- There's no in-app place for non-sensitive settings: Secrets is write-only, and environment variables are deploy-time only.
- Admins can't list or revoke people's personal API keys; only deleting the user removes them.
- The outbound URL check for webhooks runs when the endpoint is saved, not again at delivery.
- A key's permission ceiling stores permission names as text, so a renamed permission silently drops out of it.

## Related

- [Secrets](secrets.md)
- [Integrations for admins](../administer/integrations/_index.md): webhooks, secrets, service accounts
- [Build on the public API](../build/public-api/_index.md)
- Package READMEs for the exported API: [`@monark/secrets`](../../packages/secrets/README.md), [`@monark/api-keys`](../../packages/api-keys/README.md), [`@monark/webhooks`](../../packages/webhooks/README.md), [`@monark/public-api`](../../packages/public-api/README.md)
