---
type: how-to
---

# Receive webhook deliveries

Build an endpoint that accepts the events Monark sends and processes each one once. An admin registers your endpoint's URL and picks its events; see [Webhooks](../../administer/integrations/webhooks.md).

1. Expose an HTTPS URL that accepts `POST` with a JSON body. Plain `http://` is accepted only on a development instance, for `localhost` and private network addresses.
2. Parse the body. Every delivery has the same envelope:
   ```json
   {
     "type": "kanban.card-created",
     "data": { "type": "kanban.card-created", "occurredAt": "…", "cardId": "…", "organizationId": "…" }
   }
   ```
   `data` is the event's full payload. The event type is also in the `Webhook-Event-Type` header.
3. [Verify the signature](verify-signatures.md) before you trust anything in the body.
4. Skip deliveries you've already processed. Store each `Webhook-Delivery-Idempotency-Key` header you handle; a retry of the same delivery carries the same key.
5. Respond with any `2xx` status within 10 seconds. Do slow work after responding, from a queue of your own.

## Test it locally

1. Start the bundled receiver, which logs each request and checks signatures:
   ```sh
   pnpm webhook-receiver --port 4123 --secret <signing-secret>
   ```
2. Register `http://127.0.0.1:4123/hook` as an endpoint on your development instance and trigger one of its events.
3. Fetch what arrived with `curl http://127.0.0.1:4123/inbox`. Add `--fail-once` to the receiver to watch a retry.

Good to know:

- Anything other than a `2xx` within 10 seconds counts as a failure, including redirects, which aren't followed. A failed delivery is retried up to five attempts in all, after about 30 seconds, then 1, 2 and 4 minutes.
- When attempts keep failing with no success in between, the delivery is marked failed and Monark turns the endpoint off. An admin can retry failed deliveries and turn the endpoint back on.
- Deliveries can arrive out of order. Use `occurredAt` in the payload when order matters.

Next: [Verify webhook signatures](verify-signatures.md)
