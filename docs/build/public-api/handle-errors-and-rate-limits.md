---
type: how-to
---

# Handle errors and rate limits

Make an integration recover from rate limits and report the errors it can't fix. Each key may make about 5 requests per second, with bursts of up to 20.

1. Read the status and the error body on every failed call. Errors look like this:
   ```json
   { "error": { "code": "rate_limited", "message": "Rate limit exceeded ; slow down and retry." } }
   ```
2. On `429`, wait the number of seconds in the `Retry-After` header, then send the same request again.
3. To slow down before you hit the limit, watch `X-RateLimit-Remaining` on each response and pause when it reaches 0.
4. On `400`, fix the request; the message names each rejected field. Retrying unchanged fails again.
5. On `401`, `403` or `404`, stop and report: the key is wrong or revoked, lacks a permission, or the model, record or API isn't available to it.
6. On `500`, retry a few times with growing delays, then report.

A retry wrapper that does this:

```js
async function callMonark(path, init = {}, attempt = 0) {
  const res = await fetch(`${process.env.MONARK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.MONARK_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (res.ok) return res.status === 204 ? null : res.json();

  const retryable = res.status === 429 || res.status >= 500;
  if (retryable && attempt < 5) {
    const seconds = Number(res.headers.get("Retry-After")) || 2 ** attempt;
    await new Promise((r) => setTimeout(r, seconds * 1000));
    return callMonark(path, init, attempt + 1);
  }
  const { error } = await res.json().catch(() => ({ error: {} }));
  throw new Error(`${res.status} ${error.code ?? ""}: ${error.message ?? res.statusText}`);
}
```

Good to know:

- The limit is per key and holds across every API server. Whoever runs your instance can change the rate and burst.
- A `POST` that times out may have created the record. Give records a `slug` you choose, and before retrying, list with `search=<slug>` to check.

The full list of codes and headers is in the [Public API reference](../../reference/public-api.md#errors).
