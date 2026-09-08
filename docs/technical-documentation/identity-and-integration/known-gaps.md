# Known gaps

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
  [`webhook-secret-resolver.md`](../webhook-secret-resolver/_index.md) and open in
  [the backlog](../../todo/backlog.md).
- **There is no in-app environment or configuration concept.** Environment variables are deploy-time
  only (`render.yaml`, Vercel) ; see [`environments.md`](../environments/_index.md). They are operator-only, not
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
