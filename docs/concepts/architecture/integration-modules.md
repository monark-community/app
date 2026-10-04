---
type: concept
---

# Integration modules

An integration module connects a third-party service, such as GitHub or Telegram, to the automation engine. It is an ordinary extended module: it depends only on core, lives flat under `packages/`, and plugs in through the automation module's extension points. What makes it an integration is one line of metadata in the manifest, not a folder or a tier.

## What an integration contributes

- Trigger events: the provider calls an inbound webhook route, `POST /hooks/<service>/:org`. The module verifies the delivery, maps it to a domain event such as `github.pull-request-opened`, and emits it. Any flow listening for that event runs.
- Action nodes: nodes registered with `registerAutomationNodes` that read from or write to the service, such as **GitHub: Create issue**.
- A connection: usually a settings page that generates the signing secret the provider must send, and shows whether the service is connected.

Credentials live in the [secrets](../secrets.md) store, not in the module's own tables. The provider token is a secret that nodes read with `ctx.getSecret` while they run, and the inbound signing secret is another. So a typical integration owns no tables at all, and removing one leaves nothing behind in the schema. Because the flow stores a secret's name rather than its value, an admin can rotate a provider token without editing any flow.

## Declared, not nested

In [modules.manifest.ts](../../../modules.manifest.ts), an integration carries `integrates: "@monark/automation"` beside `tier: "extended"`. `pnpm check:tiers` then also checks that the module really depends on the module it says it integrates, so the metadata can't go stale. See [Declare integrations as manifest metadata](../../decisions/0009-declare-integrations-as-manifest-metadata.md).

## Shared plumbing

`@monark/integration-kit` is a library, not a tiered module, that integrations take pieces from as they fit:

| Piece                                          | What it does                                                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defineInboundWebhook`                         | Resolves the organization's signing secret, verifies, maps and emits. Answers 404 when unconfigured, 401 on a bad signature, 202 for a delivery it doesn't model (so the provider doesn't retry). |
| `verifyHmacSha256`, `constantTimeEquals`       | Signature checks for providers that sign the body (GitHub) and providers that echo a shared secret in a header (Telegram).                                                                        |
| `makeConnectionSecretRouter`                   | The connection surface: status, generate the webhook secret, disconnect.                                                                                                                          |
| `createRestClient`, `pickString`, `pickNumber` | A JSON client for APIs that take a static auth header, and safe readers for provider payloads.                                                                                                    |

A provider-specific helper moves into the kit only when a second integration needs it.

## The integrations today

| Module             | Triggers | Actions | How it differs                                                                                                                                         |
| ------------------ | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@monark/github`   | yes      | yes     | The reference implementation: HMAC-signed deliveries, a `Bearer` REST client.                                                                          |
| `@monark/telegram` | yes      | yes     | A secret header instead of a signature; the token goes in the URL path. Connecting also registers the webhook with Telegram, so it has its own router. |
| `@monark/twitter`  | no       | yes     | X offers no usable inbound webhook. Every request is signed with OAuth 1.0a, using four credentials stored as secrets.                                 |
| `@monark/discord`  | no       | yes     | Discord has no event webhook. No connection either: each node picks its credential secret, so the module has no router and no inbound route.           |

Each integration ships behind its own feature flag, off by default; see [Feature flags](../../reference/feature-flags.md).

## Related

- [Identity and integration](../identity-and-integration.md)
- [Automations](../automations.md)
- [Add an automation node](../../build/extend/add-an-automation-node.md)
