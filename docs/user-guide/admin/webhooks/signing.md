# Signing

Every outgoing request carries five headers your receiver can use to verify authenticity :

| Header                             | Value                                                                 |
| ---------------------------------- | --------------------------------------------------------------------- |
| `Webhook-Delivery-Id`              | The delivery row's unique id.                                         |
| `Webhook-Delivery-Idempotency-Key` | Stable per (endpoint, event, correlation) ; use it to dedupe retries. |
| `Webhook-Event-Type`               | The source event's type (e.g. `rbac.role-created`).                   |
| `Webhook-Timestamp`                | Unix seconds ; recomputed per attempt.                                |
| `Webhook-Signature`                | `v1=<hex hmac-sha256(secret, "<timestamp>.<body>")>`                  |

Receivers verify by recomputing the HMAC over `<timestamp>.<body>` using their stored copy of the shared secret and a constant-time compare. Including the timestamp in the signed payload defeats replay attacks outside a tolerance window (suggested ±5 minutes).
