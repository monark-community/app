---
type: how-to
---

# Verify webhook signatures

Check that a delivery really came from Monark and wasn't replayed, before you act on it. You need the endpoint's signing secret (it starts with `whsec_`), which the admin who created the endpoint copied when it was shown.

1. Read the raw request body as bytes, before any JSON parsing. Re-serialized JSON won't match the signature.
2. Read the `Webhook-Timestamp` header (Unix seconds) and reject the request if it's more than 5 minutes from your clock.
3. Build the signed string: the timestamp, a dot, then the raw body: `<timestamp>.<body>`.
4. Compute an HMAC-SHA256 of that string, keyed with the whole secret string including `whsec_`, and hex-encode it.
5. Compare `v1=<your hex>` with the `Webhook-Signature` header using a constant-time comparison. Reject the request with `401` if they differ.

In Node.js:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function isValidDelivery(rawBody, headers, secret) {
  const timestamp = headers["webhook-timestamp"];
  const signature = headers["webhook-signature"] ?? "";
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected =
    "v1=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

## Headers on every delivery

| Header                             | Value                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `Webhook-Signature`                | `v1=` + hex HMAC-SHA256 of `<timestamp>.<body>`                        |
| `Webhook-Timestamp`                | Unix seconds, set fresh on every attempt                               |
| `Webhook-Delivery-Id`              | this delivery's id                                                     |
| `Webhook-Delivery-Idempotency-Key` | the same on every retry of one delivery; use it to skip duplicates     |
| `Webhook-Event-Type`               | the event type, such as `rbac.role-created`                            |

Good to know:

- When an admin rotates the secret, the old one stops working immediately. Update your receiver first, or expect failed deliveries until you do.
- The timestamp changes on each retry, so a retry is signed again and passes the 5-minute check.
