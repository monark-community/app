# Using the public API

Monark exposes a small, curated **REST API** at `/api/v1` so scripts, integrations,
and AI agents can read and write your organization's data without a browser
session. This page is for the person wiring that up.

Everything the API can do, it does **as you** (or as a service account) ; it can
never do more than the account behind the key. If you can't do something in the
app, a key you create can't either.

## In this section

- **[Is it on?](is-it-on.md)**
- **[Getting a key](getting-a-key.md)**
- **[Authenticating](authenticating.md)**
- **[What you can call (v1)](what-you-can-call-v1.md)**
- **[The OpenAPI spec (for tools + agents)](the-openapi-spec-for-tools-agents.md)**
- **[Rate limits](rate-limits.md)**
- **[Errors](errors.md)**
- **[Least privilege](least-privilege.md)**
