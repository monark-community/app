# Security model

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
