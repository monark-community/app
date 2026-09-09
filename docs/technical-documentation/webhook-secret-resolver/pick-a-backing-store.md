# Pick a backing store

The shape of `resolveWebhookSecret` depends on where you keep secrets. Three common deployments :

### A. Single-tenant / self-hosted with an env var (simplest)

Encode every endpoint's secret as a JSON map in one env var. New endpoints require a restart with the updated map.

```env
# services/api/.env
WEBHOOK_SECRETS_JSON={"clx9z…endpoint-id":"whsec_AbC123…","clxAa…endpoint-id":"whsec_DeF456…"}
```

```ts
// services/api/src/lib/webhook-secrets.ts
import { z } from "zod";
import { logger } from "@monark/common";

const SecretsMap = z.record(z.string(), z.string());

let cache: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (cache) return cache;
  const raw = process.env.WEBHOOK_SECRETS_JSON;
  if (!raw) return (cache = {});
  try {
    cache = SecretsMap.parse(JSON.parse(raw));
    return cache;
  } catch (err) {
    logger.error({ err }, "WEBHOOK_SECRETS_JSON env var failed to parse ; treating as empty");
    return (cache = {});
  }
}

export async function resolveWebhookSecret(endpointId: string): Promise<string | null> {
  return load()[endpointId] ?? null;
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
const PREFIX = "WEBHOOK_SECRET_";

export async function resolveWebhookSecret(endpointId: string): Promise<string | null> {
  // Endpoint ids are cuid()s ; alphanumeric, safe to embed in an env-var name.
  // Reject anything else defensively so a hostile id can't reach into
  // unrelated env vars.
  if (!/^[a-z0-9]+$/i.test(endpointId)) return null;
  return process.env[`${PREFIX}${endpointId}`] ?? null;
}
```

Trade-off : one env var per endpoint. Works to ~50 endpoints comfortably ; past that, look at (C).

### C. AWS Secrets Manager / Vault / a sidecar (production-grade)

Store one secret per endpoint in your secret manager, keyed on `webhooks/<endpointId>`. The resolver fetches on demand and caches with a TTL so a rotation propagates within minutes without a restart.

```ts
// services/api/src/lib/webhook-secrets.ts
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({});
const cache = new Map<string, { value: string | null; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function resolveWebhookSecret(endpointId: string): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(endpointId);
  if (hit && hit.expiresAt > now) return hit.value;

  try {
    const out = await client.send(
      new GetSecretValueCommand({ SecretId: `webhooks/${endpointId}` }),
    );
    const value = out.SecretString ?? null;
    cache.set(endpointId, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  } catch (err) {
    if ((err as { name?: string }).name === "ResourceNotFoundException") {
      cache.set(endpointId, { value: null, expiresAt: now + CACHE_TTL_MS });
      return null;
    }
    throw err;
  }
}
```

Vault / GCP Secret Manager / Azure Key Vault follow the same shape ; fetch by `webhooks/<endpointId>`, cache with a TTL, treat "not found" as `null` (an explicit decision, not a transient error).
