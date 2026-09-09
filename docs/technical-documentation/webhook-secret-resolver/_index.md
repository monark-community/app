# Webhook Secret Resolver

The `@monark/webhooks` worker signs every outgoing request with HMAC-SHA-256 of the endpoint's shared secret. The DB only stores the SHA-256 hash of the secret ; the plaintext is shown to the operator exactly once at endpoint creation (or rotation) time. This means the worker needs a runtime path to resolve `endpointId → plaintext secret` before it can sign anything.

That path is the **secret resolver** ; a single function the api process registers at boot. Until a resolver is registered, every delivery records a `no plaintext secret available for endpoint ; rotate the secret to re-arm signing` error and the endpoint eventually auto-disables.

## In this section

- **[Pick a backing store](pick-a-backing-store.md)**
- **[Verifying the wiring](verifying-the-wiring.md)**

## Contract

```ts
import { setWebhookSecretResolver } from "@monark/webhooks/server";

setWebhookSecretResolver(async (endpointId: string): Promise<string | null> => {
  // Return the plaintext secret string for this endpoint, or null if
  // it isn't available (rotated, deleted, deploy-out-of-sync). Null
  // results record a delivery error ; throwing surfaces a worker
  // exception in the logs but doesn't crash the process.
  return null;
});
```

The resolver is called **per attempt** (not per request boot) so a secret rotated in the backing store reaches the next outbound delivery without restarting the api. Cache aggressively if your backing store is slow ; deliveries fire on a 5 s cadence by default.

Wire the resolver in [services/api/src/server.ts](../../../services/api/src/server.ts) **before** `startWebhookDeliveryWorker()`. The pattern is :

```ts
// services/api/src/server.ts
import { setWebhookSecretResolver, startWebhookDeliveryWorker } from "@monark/webhooks/server";
import { resolveWebhookSecret } from "./lib/webhook-secrets";

setWebhookSecretResolver(resolveWebhookSecret);
startWebhookDeliveryWorker();
```


## Rotation

The webhook tRPC `webhooks.rotateSecret` mutation mints a new plaintext secret, persists its hash, and returns the plaintext exactly once. After your operator copies it, your control plane (Vercel CLI, AWS CLI, Vault CLI, etc.) must immediately update the backing store so the next delivery picks up the new secret.

Suggested operator flow :

1. Click "Rotate secret" in the admin UI ; copy the returned plaintext.
2. Update the backing store (`vercel env add`, `aws secretsmanager put-secret-value`, etc.).
3. (For env-var backings without auto-reload :) trigger an api redeploy / restart so the cache rebuilds. Secret-manager backings re-read within the cache TTL automatically.
4. Optionally trigger a manual retry of any delivery that failed during the rotation window via `webhooks.retryDelivery`.


## What to do if you can't ship a resolver yet

The platform is safe to deploy without a resolver ; it just won't actually deliver webhooks. Symptoms :

- Every `WebhookDeliveryAttempt` row has `error = "no plaintext secret available for endpoint ; rotate the secret to re-arm signing"`.
- After 5 consecutive failures (the default `WEBHOOK_DELIVERY_FAILURE_LIMIT`) the endpoint flips to `disabled` and emits `webhook.endpoint-disabled-after-failures`.

If you're rolling webhooks out gradually, leave the resolver unset until you're ready ; operators creating endpoints will see deliveries fail in the admin UI's delivery list, which is the right surface to communicate "not configured yet."
