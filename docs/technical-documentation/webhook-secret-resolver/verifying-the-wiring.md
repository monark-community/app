# Verifying the wiring

Smoke check after registering the resolver :

1. `pnpm --filter api dev` and confirm the boot log shows `webhook delivery worker started`.
2. In a second shell, run the bundled mock receiver : `pnpm webhook-receiver --port 4123`. (For a public-internet check use `https://webhook.site/<your-uuid>` instead : the validator only allows `http://` for loopback / RFC 1918 hosts in development, never in production.)
3. Create a test endpoint via /admin/webhooks → New endpoint pointed at `http://127.0.0.1:4123/hook`. Subscribe to a high-frequency event you can trigger ; `feature-flag.flipped` is the easiest (toggle a flag in the admin UI).
4. Trigger the event ; you should see one HTTP request land at the receiver within 5–10 seconds, with the headers documented in [packages/webhooks/README.md § Signing](../../../packages/webhooks/README.md#signing). The receiver's stdout shows `[receiver] ACCEPTED POST /hook feature-flag.flipped …` and `curl http://127.0.0.1:4123/inbox` returns the full payload.
5. The corresponding `WebhookDeliveryAttempt` row in the DB should have `statusCode = 200` and `error = null`.

If you see the `no plaintext secret available` error, the resolver isn't returning a value for that endpoint id. Log `endpointId` inside the resolver to confirm it's getting called and what id it's looking up.
