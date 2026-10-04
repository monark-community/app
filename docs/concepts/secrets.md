---
type: concept
---

# Secrets

Secrets is a per-organization store of encrypted named values, such as `GITHUB_TOKEN`, that let Monark authenticate to other systems. The one idea behind it: a value goes in and never comes back out over the API. Only server code running for that organization can decrypt it, at the moment it makes an outbound call.

## The pieces

| Piece              | What it does                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The store          | `@monark/secrets`: the `Secret` table, its permissions, its events and a write-only API. Admins manage it under **Admin > Secrets**.                              |
| Encryption         | A shared AES-256-GCM helper in `@monark/common/crypto`, also used for two-factor secrets, each with its own key.                                                  |
| The node read path | Automation nodes call `ctx.getSecret(name)` while they run. It resolves against the run's organization.                                                           |
| The `secret` field | A node config field type. The flow stores the secret's name, never its value; the editor shows a dropdown of names.                                               |
| Guarded fetch      | `safeFetch` in `@monark/common/http`: the outbound HTTP helper that integration nodes, the generic webhook node and the webhooks module use to reach the outside. |

Integration modules use the same store. GitHub and Telegram keep their inbound signing secrets in it, generated from their settings pages and checked on every delivery. Telegram's bot token and Twitter's app keys live in it under fixed names. GitHub and Discord nodes let the flow author pick a secret by name instead.

## Security model

Values are write-only over the wire. No procedure returns a value, at any permission level. Listing returns names and metadata (description, last used, updated) and needs permission to read secrets. Creating, replacing and deleting need permission to manage secrets. The admin screen can replace a value but never displays it. The events the store emits (created, updated, deleted) carry the name, never the value.

Values are encrypted at rest. Each one is stored as AES-256-GCM ciphertext with a 12-byte IV and a 16-byte authentication tag. The key comes from `SECRETS_ENCRYPTION_KEY` (32 bytes, hex-encoded). It's deliberately separate from `TOTP_ENCRYPTION_KEY`, so a leak of one exposes nothing protected by the other. The key is loaded on first use and fails closed: if it's unset, any attempt to set or read a secret throws, and a deploy that never uses secrets doesn't need it.

Organizations are isolated. Every row is keyed by organization and name, and every read takes the organization id. `ctx.getSecret` only sees the running flow's organization, so there's no path from one organization to another's values.

Values are never stored or logged as plaintext. A run step records the resolved node config, which holds the secret's name, not its value. A node uses the value for its own outbound call and must not log it or return it as output. Each read stamps the secret's last-used time, shown in the admin list.

The trust boundary is installed code. Any registered node type can read any secret of its own organization. Node types are server code, deployed with the app, so they get the same trust as the rest of the server. Who wrote a flow, and whether they can read secrets themselves, plays no part.

## Outbound calls

Nodes that reach other systems go through `safeFetch`, which checks the URL before it sends anything:

- `https://` is allowed for public hosts, and refused when the host is a literal private, loopback or reserved IP address.
- `http://` is allowed only outside production, and only to loopback or private-network hosts, for local testing.
- In production the host name is resolved first, and the call is refused if any address is private or reserved. This stops a public name that points at an internal service.
- Requests time out after 10 seconds by default, and redirects are not followed, so a redirect can't lead to an unchecked target.

A small gap remains between the lookup and the request itself, so a host that changes its DNS answer in that instant could still slip through.

## Limits

- Secrets belong to the organization. There are no per-person credentials, and two people who manage secrets overwrite each other's values.
- One encryption key encrypts every value; there's no key rotation.
- Integrations that use fixed names get one connection per organization.
- Secrets suit credentials only. There's no readable store for non-sensitive settings.

## Related

- [Identity and integration](identity-and-integration.md): where secrets fit next to API keys, service accounts and webhooks
- [Store integration credentials in one write-only secret store](../decisions/0006-store-integration-credentials-in-a-write-only-secret-store.md)
- [Integrations for admins](../administer/integrations/_index.md)
- [`@monark/secrets` README](../../packages/secrets/README.md): exports, data model, events
