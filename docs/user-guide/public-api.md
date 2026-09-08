# Using the public API

Monark exposes a small, curated **REST API** at `/api/v1` so scripts, integrations,
and AI agents can read and write your organization's data without a browser
session. This page is for the person wiring that up.

Everything the API can do, it does **as you** (or as a service account) ; it can
never do more than the account behind the key. If you can't do something in the
app, a key you create can't either.

## Is it on?

The public API ships **off by default**. An organization admin turns it on in
**Admin → Feature flags** by enabling `public-api.enabled`. Until then, any key
you create is inert ; the account API-keys page shows a notice when that's the
case. (There's a separate `public-api.service-accounts` flag for the
service-account admin surface, covered below.)

## Getting a key

Go to **Account → API keys** and choose **New API key**. You'll set:

- **Name** : a label so you can tell keys apart later ("Zapier", "nightly sync").
- **Access** :
  - **Full access** : the key acts with everything _you_ can do.
  - **Limited** : pick a subset of your own permissions ; an ad-hoc role that
    exists only for this key. You can only pick permissions you actually hold.
- **Expiration** : optional; the key stops working after it.

When you create it, the key is shown **once** (it starts with `mrk_`). Copy it
immediately : it's stored only as a hash and can never be shown again. Lost it?
Revoke it and make a new one.

A key is always tied to **one organization** (the one you're in when you create
it) and is revocable at any time from the same page.

## Authenticating

Send the key as a Bearer token on every request:

```bash
curl -H "Authorization: Bearer mrk_your_key_here" \
  https://<your-monark-host>/api/v1/me
```

`GET /api/v1/me` returns the identity + organization the key acts as ; a good
first call to confirm your key works. The exact base URL for your deployment is
shown on the Account → API keys page.

## What you can call (v1)

| Method + path                       | What it does                              |
| ----------------------------------- | ----------------------------------------- |
| `GET /api/v1/me`                    | The key's identity + organization.        |
| `GET /api/v1/models`                | List your Data Models.                    |
| `GET /api/v1/models/{key}`          | One Data Model by its key.                |
| `GET /api/v1/models/{key}/fields`   | A model's field definitions.              |
| `GET /api/v1/models/{key}/records`  | List a model's records (paginated).       |
| `POST /api/v1/models/{key}/records` | Create a record.                          |
| `GET /api/v1/records/{id}`          | One record by id.                         |
| `PATCH /api/v1/records/{id}`        | Update a record.                          |
| `DELETE /api/v1/records/{id}`       | Delete a record (`?hard=true` to purge).  |
| `GET /api/v1/openapi.json`          | The full machine-readable spec (no auth). |

Examples:

```bash
# List records in the "projects" model
curl -H "Authorization: Bearer mrk_…" \
  https://<host>/api/v1/models/projects/records

# Create a record
curl -X POST -H "Authorization: Bearer mrk_…" -H "Content-Type: application/json" \
  -d '{"data":{"title":"New project","status":"active"}}' \
  https://<host>/api/v1/models/projects/records
```

> **Projects, tasks, and everything else** live as **Data Model records** ; there
> is no separate endpoint per feature. Whatever Data Models your org has defined,
> you reach them all through `/models/{key}/records`.

## The OpenAPI spec (for tools + agents)

`GET /api/v1/openapi.json` returns a standard OpenAPI 3 document describing every
route, its parameters, and its request/response shapes. Point an SDK generator,
an API client (Postman, Insomnia), or an AI agent at it and it can discover the
whole surface. Each route also advertises the RBAC permission it needs as
`x-required-permission`.

### AI agents (MCP)

For agent hosts that speak the **Model Context Protocol** (Claude Desktop,
Cursor, …), Monark ships an MCP server (`@monark/mcp`) that exposes these
endpoints as native tools. You give it your Monark URL + an `mrk_` key and the
agent can read and write your data directly, capped by that key's permissions.
Setup is in [services/mcp/README.md](../../services/mcp/README.md).

## Rate limits

Each key gets a token bucket ; by default a sustained **5 requests/second** with
a **burst of 20** (an operator can change this via the `PUBLIC_API_RATE_PER_SECOND`
and `PUBLIC_API_BURST` environment variables). Every response carries
`X-RateLimit-Limit` and `X-RateLimit-Remaining`; when you're over, you get
**HTTP 429** with a `Retry-After` header telling you how many seconds to wait.

## Errors

Errors are JSON: `{ "error": { "code": "…", "message": "…" } }` with a matching
HTTP status : `401` (missing/invalid/revoked/expired key), `403` (the key's
account lacks the permission, or a limited key wasn't granted it), `404`,
`400` (bad request body), `429` (rate limited).

## Least privilege

Two ways to hand out _less_ than full access:

1. **A limited personal key** : pick a subset of your own permissions when you
   create it (above). Good for your own scripts.
2. **A service account** : an org-owned "machine" identity with its own roles,
   created by an admin under **Admin → Service accounts** (behind the
   `public-api.service-accounts` flag). Its keys act as the account, not a
   person, so they survive staff changes and attribute cleanly. Give the account
   a read-only role and its keys are read-only. This is the right choice for a
   shared, long-lived integration.

Either way, the ceiling is only ever _narrower_ than the owning account: a key's
effective rights are its allowlist **intersected with the account's current
permissions**. If the account loses a permission, the key loses it too, the same
moment : nothing to re-issue.
