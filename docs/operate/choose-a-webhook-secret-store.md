---
type: runbook
---

# Choose a webhook secret store

Keep webhook signing secrets available to the api across restarts, so outgoing deliveries stay signed. Do this before an organization relies on webhooks. About 10 minutes per endpoint with the built-in options.

The database stores only a hash of each endpoint's secret; the plaintext is shown once, when the endpoint is created or its secret rotated. Before signing a delivery, the api looks for the plaintext in this order:

1. its own memory, which holds every secret created or rotated since the process started;
2. a secrets file, used by default outside production and in production only when `MONARK_DEV_WEBHOOK_SECRETS_FILE` is set;
3. `WEBHOOK_SECRETS_JSON`, then `WEBHOOK_SECRET_<endpointId>`.

So in production a new endpoint works until the next restart or redeploy, and on only the instance that created it. After that every delivery fails with `no plaintext secret available for endpoint ; rotate the secret to re-arm signing`, and after 5 consecutive failures the endpoint is disabled.

| Store                         | Good for                                 | Cost                                      |
| ----------------------------- | ---------------------------------------- | ----------------------------------------- |
| `WEBHOOK_SECRETS_JSON`        | a few endpoints                          | a redeploy for each new or rotated secret |
| `WEBHOOK_SECRET_<endpointId>` | dozens of endpoints, one variable each   | a redeploy for each new or rotated secret |
| Your own secret manager       | many endpoints, or several api instances | a code change in the api                  |

## Before you start

- [ ] Access to the api's environment variables
- [ ] Administrator access to **Admin → Webhooks**

## Steps

1. In **Admin → Webhooks**, create the endpoint (or open it and click **Rotate secret**), then click **Copy secret**.
2. Note the endpoint id: with the endpoint open, it's the value after `webhook=` in the address bar.
3. Add the secret to the api, keyed by that id. Either one JSON map for all endpoints:
   ```text
   WEBHOOK_SECRETS_JSON={"<endpointId>":"<secret>","<otherEndpointId>":"<otherSecret>"}
   ```
   or one variable per endpoint:
   ```text
   WEBHOOK_SECRET_<endpointId>=<secret>
   ```
4. Save; on Render this redeploys the api.
5. If deliveries failed while the secret was missing, open each failed delivery under **Deliveries** and click **Retry now**.

## Use your own secret manager

To read secrets from AWS Secrets Manager, Vault or similar, change `services/api/src/server.ts`, where the api calls `setWebhookSecretResolver(makeEnvVarSecretResolver())` before starting the delivery worker. Either:

- replace that resolver with your own `(endpointId) => Promise<string | null>`; it runs on each delivery attempt, so cache lookups with a short expiry and return `null` for a secret that doesn't exist; or
- call `setWebhookSecretStore(store)` with an object that has `put`, `get` and `delete`. The api then writes each new or rotated secret to your store itself, and removes it when the endpoint is deleted.

Both are exported from `@monark/webhooks/server`.

## Verify

Trigger an event the endpoint subscribes to (for example, create a role for `rbac.role-created`). Under **Deliveries**, the delivery shows **Delivered**. Then restart the api and trigger it again: it's still delivered.

## If something goes wrong

| Symptom                                          | Cause                                                   | Fix                                                                               |
| ------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `no plaintext secret available` after a restart  | the secret was only in memory                           | Add it as in step 3.                                                              |
| Same error with the variable set                 | wrong endpoint id, or the secret was rotated since      | Recheck the id; rotate again and update the value.                                |
| Log shows `WEBHOOK_SECRETS_JSON failed to parse` | invalid JSON (often a quoting problem in the dashboard) | Paste a single-line JSON object with double quotes.                               |
| Receivers reject the signature                   | the receiver holds an older secret                      | Give the receiver the current secret.                                             |
| Endpoint disabled                                | 5 consecutive failures                                  | Fix the cause, then set the endpoint's status to **Active, receives deliveries**. |

Next: [Recover a locked-out user](recover-a-locked-out-user.md)
