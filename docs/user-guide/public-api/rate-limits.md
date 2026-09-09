# Rate limits

Each key gets a token bucket ; by default a sustained **5 requests/second** with
a **burst of 20** (an operator can change this via the `PUBLIC_API_RATE_PER_SECOND`
and `PUBLIC_API_BURST` environment variables). Every response carries
`X-RateLimit-Limit` and `X-RateLimit-Remaining`; when you're over, you get
**HTTP 429** with a `Retry-After` header telling you how many seconds to wait.
