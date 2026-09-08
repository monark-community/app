# Secrets store + automation integration

The **secrets substrate** lets any module reach an external system securely: a
per-organization, encrypted-at-rest `key → value` store (`@monark/secrets`), a
server-only read path on the automation node-execution context
(`ctx.getSecret`), and a shared guarded-outbound-HTTP helper
(`@monark/common/http`). It is the enabling primitive for future integration
modules (social posting, GitHub issue creation, etc.) ; those register their own
automation nodes and, from a node's `execute`, read the org's stored access
tokens without any of them ever crossing the tRPC boundary.

## Pieces

| Piece                 | Where                                                                                                  | What                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crypto primitive      | [`@monark/common/crypto`](../../packages/common/src/crypto.ts)                                         | Generic AES-256-GCM (`encrypt` / `decrypt` / `loadEncryptionKey`). Shared by TOTP + secrets, each keyed by its own env var.                               |
| Secret store          | [`@monark/secrets`](../../packages/secrets/README.md)                                                  | The `Secret` Prisma model, the data layer, RBAC (`secrets.{read,manage}`), events (`secrets.{created,updated,deleted}`), and the write-only tRPC router.  |
| Node read path        | [`ctx.getSecret`](../../packages/automation/src/server/registry.ts)                                    | Added to `NodeExecutionContext`; wired in [`engine.ts`](../../packages/automation/src/server/engine.ts) to `getSecretValue(org, name)`.                   |
| `secret` config field | [`AutomationNodeConfigFieldType`](../../packages/automation/src/contracts/nodes.ts)                    | A node config field whose stored value is the secret's **name** (a reference), never the value.                                                           |
| Editor picker         | [`automation-editor.tsx`](<../../services/web/src/app/(authed)/automation/[id]/automation-editor.tsx>) | Renders a `secret` field as a name dropdown (backed by `automation.secrets.list`), empty-state links to `/admin/secrets`.                                 |
| Guarded fetch         | [`@monark/common/http`](../../packages/common/src/http.ts)                                             | `assertOutboundUrlSafe(url)` + `safeFetch(url, opts)` ; the scheme/host guard + abort-timeout wrapper reused by the webhook node and the webhooks module. |

## Security model

- **Write-only surface.** The plaintext value never crosses tRPC. There is **no
  read-value procedure at all** ; `adminList` returns names + metadata,
  `adminSet` accepts a new value, `adminDelete` removes one. The admin UI can
  replace a value but never displays it.
- **Encrypted at rest.** AES-256-GCM (12-byte IV, 16-byte tag) keyed by
  `SECRETS_ENCRYPTION_KEY` ; 32 bytes hex, **separate** from
  `TOTP_ENCRYPTION_KEY` so a leak of one key doesn't expose the other. Loaded
  lazily (fail-closed): unset ⇒ any set/read throws; a deploy that never touches
  secrets doesn't need it.
- **Per-org isolation.** Every row is scoped by `organizationId` + the
  `(organizationId, key)` unique. All reads take the org id, so one org can never
  read another's value. `ctx.getSecret` resolves against the running
  automation's org only.
- **Never persisted / logged as a value.** The resolved node config stored on a
  run step holds the secret's **name**, not the plaintext (the `secret` field
  type stores a reference). `ctx.getSecret` returns the value only for the
  duration of the node's own outbound call; it must not be `ctx.log`-ed or
  returned as node output. `getSecretValue` stamps `lastUsedAt` on each read.
- **Decryption trust boundary.** Any registered node type can read any of _its
  own org's_ secrets via `ctx.getSecret`. Node types are installed code (same
  trust as server code), so this is acceptable; there is no cross-org path.

## Using a secret from a node

```ts
registerAutomationNodes("github", {
  "create-issue": defineNode({
    descriptor: {
      kind: "action",
      category: "integration",
      label: "Create GitHub issue",
      inputs: [{ id: "in" }],
      outputs: [{ id: "out" }],
      // A `secret` config field: the author picks a secret by NAME.
      configFields: [{ key: "token", label: "GitHub token", type: "secret", required: true }],
    },
    configSchema: z.object({ token: z.string() /* … */ }),
    execute: async (ctx, config) => {
      const token = await ctx.getSecret(config.token); // decrypt on demand
      if (!token) throw new Error("GitHub token secret is not set for this org.");
      const res = await safeFetch("https://api.github.com/repos/…/issues", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({
          /* … */
        }),
      });
      // Return only non-sensitive result data ; never the token.
      return { status: res.status };
    },
  }),
});
```

## Outbound HTTP guard

`assertOutboundUrlSafe(url)` allows `https://` always, `http://` only in
non-production to loopback / RFC 1918 hosts, and rejects everything else
(throws `ValidationError`). `safeFetch` runs that guard, then issues the request
with an AbortController timeout. **Known limitation:** it is a scheme + host
string check; it does not resolve DNS, so it does not defend against a public
host that resolves to an internal IP (DNS-rebinding SSRF). Resolving the host and
rejecting private IP ranges is a planned hardening.

## Key rotation

v1 uses a single `SECRETS_ENCRYPTION_KEY`. A rotation story (versioned keys +
re-encrypt) is deferred.
