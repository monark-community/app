# Webhook Secret Resolver

The `@monark/webhooks` worker signs every outgoing request with HMAC-SHA-256 of the endpoint's shared secret. The DB only stores the SHA-256 hash of the secret ; the plaintext is shown to the operator exactly once at endpoint creation (or rotation) time. This means the worker needs a runtime path to resolve `endpointId → plaintext secret` before it can sign anything.

That path is the **secret resolver** — a single function the api process registers at boot. Until a resolver is registered, every delivery records a `no plaintext secret available for endpoint ; rotate the secret to re-arm signing` error and the endpoint eventually auto-disables.

## Contract

```ts
import { setWebhookSecretResolver } from "@monark/webhooks/server"

setWebhookSecretResolver(async (endpointId: string): Promise<string | null> => {
  // Return the plaintext secret string for this endpoint, or null if
  // it isn't available (rotated, deleted, deploy-out-of-sync). Null
  // results record a delivery error ; throwing surfaces a worker
  // exception in the logs but doesn't crash the process.
  return null
})
```

The resolver is called **per attempt** (not per request boot) so a secret rotated in the backing store reaches the next outbound delivery without restarting the api. Cache aggressively if your backing store is slow ; deliveries fire on a 5 s cadence by default.

Wire the resolver in [services/api/src/server.ts](../../services/api/src/server.ts) **before** `startWebhookDeliveryWorker()`. The pattern is :

```ts
// services/api/src/server.ts
import { setWebhookSecretResolver, startWebhookDeliveryWorker } from "@monark/webhooks/server"
import { resolveWebhookSecret } from "./lib/webhook-secrets"

setWebhookSecretResolver(resolveWebhookSecret)
startWebhookDeliveryWorker()
```

## Pick a backing store

The shape of `resolveWebhookSecret` depends on where you keep secrets. Three common deployments :

### A. Single-tenant / self-hosted with an env var (simplest)

Encode every endpoint's secret as a JSON map in one env var. New endpoints require a restart with the updated map.

```env
# services/api/.env
WEBHOOK_SECRETS={"clx9z…endpoint-id":"whsec_AbC123…","clxAa…endpoint-id":"whsec_DeF456…"}
```

```ts
// services/api/src/lib/webhook-secrets.ts
import { z } from "zod"
import { logger } from "@monark/common"

const SecretsMap = z.record(z.string(), z.string())

let cache: Record<string, string> | null = null

function load(): Record<string, string> {
  if (cache) return cache
  const raw = process.env.WEBHOOK_SECRETS
  if (!raw) return (cache = {})
  try {
    cache = SecretsMap.parse(JSON.parse(raw))
    return cache
  } catch (err) {
    logger.error({ err }, "WEBHOOK_SECRETS env var failed to parse ; treating as empty")
    return (cache = {})
  }
}

export async function resolveWebhookSecret(endpointId: string): Promise<string | null> {
  return load()[endpointId] ?? null
}
```

Trade-off : restart-to-rotate. Fine for one or two endpoints and a single-process deploy.

### B. Vercel / Cloudflare-hosted (env-keyed, no restart)

Put each endpoint's secret in its own env var named with a stable prefix, then read on demand. Lets you add an endpoint by setting an env var without redeploying the rest of the platform.

```env
# Vercel project env (or .env.local for dev)
WEBHOOK_SECRET_clx9zEndpointIdHere=whsec_AbC123…
WEBHOOK_SECRET_clxAaEndpointIdHere=whsec_DeF456…
```

```ts
// services/api/src/lib/webhook-secrets.ts
const PREFIX = "WEBHOOK_SECRET_"

export async function resolveWebhookSecret(endpointId: string): Promise<string | null> {
  // Endpoint ids are cuid()s — alphanumeric, safe to embed in an env-var name.
  // Reject anything else defensively so a hostile id can't reach into
  // unrelated env vars.
  if (!/^[a-z0-9]+$/i.test(endpointId)) return null
  return process.env[`${PREFIX}${endpointId}`] ?? null
}
```

Trade-off : one env var per endpoint. Works to ~50 endpoints comfortably ; past that, look at (C).

### C. AWS Secrets Manager / Vault / a sidecar (production-grade)

Store one secret per endpoint in your secret manager, keyed on `webhooks/<endpointId>`. The resolver fetches on demand and caches with a TTL so a rotation propagates within minutes without a restart.

```ts
// services/api/src/lib/webhook-secrets.ts
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager"

const client = new SecretsManagerClient({})
const cache = new Map<string, { value: string | null; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

export async function resolveWebhookSecret(endpointId: string): Promise<string | null> {
  const now = Date.now()
  const hit = cache.get(endpointId)
  if (hit && hit.expiresAt > now) return hit.value

  try {
    const out = await client.send(
      new GetSecretValueCommand({ SecretId: `webhooks/${endpointId}` }),
    )
    const value = out.SecretString ?? null
    cache.set(endpointId, { value, expiresAt: now + CACHE_TTL_MS })
    return value
  } catch (err) {
    if ((err as { name?: string }).name === "ResourceNotFoundException") {
      cache.set(endpointId, { value: null, expiresAt: now + CACHE_TTL_MS })
      return null
    }
    throw err
  }
}
```

Vault / GCP Secret Manager / Azure Key Vault follow the same shape — fetch by `webhooks/<endpointId>`, cache with a TTL, treat "not found" as `null` (an explicit decision, not a transient error).

## Rotation

The webhook tRPC `webhooks.rotateSecret` mutation mints a new plaintext secret, persists its hash, and returns the plaintext exactly once. After your operator copies it, your control plane (Vercel CLI, AWS CLI, Vault CLI, etc.) must immediately update the backing store so the next delivery picks up the new secret.

Suggested operator flow :

1. Click "Rotate secret" in the admin UI ; copy the returned plaintext.
2. Update the backing store (`vercel env add`, `aws secretsmanager put-secret-value`, etc.).
3. (For env-var backings without auto-reload :) trigger an api redeploy / restart so the cache rebuilds. Secret-manager backings re-read within the cache TTL automatically.
4. Optionally trigger a manual retry of any delivery that failed during the rotation window via `webhooks.retryDelivery`.

## What to do if you can't ship a resolver yet

The platform is safe to deploy without a resolver — it just won't actually deliver webhooks. Symptoms :

- Every `WebhookDeliveryAttempt` row has `error = "no plaintext secret available for endpoint ; rotate the secret to re-arm signing"`.
- After 5 consecutive failures (the default `WEBHOOK_DELIVERY_FAILURE_LIMIT`) the endpoint flips to `disabled` and emits `webhook.endpoint-disabled-after-failures`.

If you're rolling webhooks out gradually, leave the resolver unset until you're ready ; operators creating endpoints will see deliveries fail in the admin UI's delivery list, which is the right surface to communicate "not configured yet."

## Verifying the wiring

Smoke check after registering the resolver :

1. `pnpm --filter api dev` and confirm the boot log shows `webhook delivery worker started`.
2. In a second shell, run the bundled mock receiver : `pnpm webhook-receiver --port 4123`. (For a public-internet check use `https://webhook.site/<your-uuid>` instead — the validator only allows `http://` for loopback / RFC 1918 hosts in development, never in production.)
3. Create a test endpoint via /admin/webhooks → New endpoint pointed at `http://127.0.0.1:4123/hook`. Subscribe to a high-frequency event you can trigger — `feature-flag.flipped` is the easiest (toggle a flag in the admin UI).
4. Trigger the event ; you should see one HTTP request land at the receiver within 5–10 seconds, with the headers documented in [packages/webhooks/README.md § Signing](../../packages/webhooks/README.md#signing). The receiver's stdout shows `[receiver] ACCEPTED POST /hook feature-flag.flipped …` and `curl http://127.0.0.1:4123/inbox` returns the full payload.
5. The corresponding `WebhookDeliveryAttempt` row in the DB should have `statusCode = 200` and `error = null`.

If you see the `no plaintext secret available` error, the resolver isn't returning a value for that endpoint id. Log `endpointId` inside the resolver to confirm it's getting called and what id it's looking up.
