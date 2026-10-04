---
type: reference
---

# Public API

The REST API at `/api/v1`: endpoints, authentication, errors and rate limits. Every path below is relative to the base URL shown on your **API keys** page, for example `https://api.example.com/api/v1`.

<!-- source: services/api/src/public/routes.ts (V1_ROUTES), services/api/src/public/mount.ts -->

## Availability

| Condition                                   | Result                                                       |
| ------------------------------------------- | ------------------------------------------------------------ |
| `public-api.enabled` flag off (the default) | every `/api/v1` route, including `openapi.json`, returns 404 |
| flag on for the key's user or organization  | routes respond as listed below                               |

## Authentication

| Item           | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| Header         | `Authorization: Bearer <key>`                                               |
| Key format     | starts with `mrk_`; shown once at creation                                  |
| Key scope      | one organization: the one you were in when you created it                   |
| Acts as        | the key's owner (a person or a service account), with that owner's roles    |
| Limited keys   | may only call endpoints whose required permission is in the key's allowlist |
| No auth needed | `GET /openapi.json`                                                         |

## Endpoints

| Method and path              | Does                                               | Required permission         | MCP tool                   |
| ---------------------------- | -------------------------------------------------- | --------------------------- | -------------------------- |
| `GET /me`                    | returns the key's `userId` and `organizationId`    | none                        | `monark_whoami`            |
| `GET /models`                | lists the organization's data models (paginated)   | `data-models.read-schema`   | `monark_list_models`       |
| `GET /models/{key}`          | returns one data model by its key                  | `data-models.read-schema`   | `monark_get_model`         |
| `GET /models/{key}/fields`   | lists a model's fields                             | `data-models.read-schema`   | `monark_list_model_fields` |
| `GET /models/{key}/records`  | lists a model's records (paginated)                | `data-models.record-read`   | `monark_list_records`      |
| `POST /models/{key}/records` | creates a record                                   | `data-models.record-write`  | `monark_create_record`     |
| `GET /records/{id}`          | returns one record                                 | `data-models.record-read`   | `monark_get_record`        |
| `PATCH /records/{id}`        | updates a record; only the fields you send change  | `data-models.record-write`  | `monark_update_record`     |
| `DELETE /records/{id}`       | soft-deletes a record and returns `{ "ok": true }` | `data-models.record-delete` | `monark_delete_record`     |
| `GET /openapi.json`          | the OpenAPI 3 document for every endpoint above    | none                        | none                       |

Projects, tasks and every other kind of entity are data model records; there is no endpoint per feature.

## Parameters

| Endpoint                                  | Parameter | In    | Type                                  | Notes                                                |
| ----------------------------------------- | --------- | ----- | ------------------------------------- | ---------------------------------------------------- |
| `GET /models`, `GET .../records`          | `limit`   | query | integer, 1 to 100                     | defaults to 25                                       |
| `GET /models`, `GET .../records`          | `cursor`  | query | string                                | the `nextCursor` from the previous page              |
| `GET /models`, `GET .../records`          | `search`  | query | string, up to 120 characters          | on records, matches the title or slug, ignoring case |
| `POST .../records`                        | `data`    | body  | object, field key → value             | required                                             |
| `POST .../records`, `PATCH /records/{id}` | `slug`    | body  | string, 1 to 60 characters, or `null` | optional                                             |
| `PATCH /records/{id}`                     | `data`    | body  | object, field key → value             | optional; omitted fields keep their value            |
| `DELETE /records/{id}`                    | `hard`    | query | boolean                               | `true` purges the record permanently                 |

## Paginated responses

| Field        | Type             | Meaning                                                |
| ------------ | ---------------- | ------------------------------------------------------ |
| `items`      | array            | the rows on this page                                  |
| `nextCursor` | string or `null` | pass as `cursor` for the next page; `null` on the last |
| `total`      | integer          | rows matching the same filter, across all pages        |

## OpenAPI extensions

| Extension               | On        | Value                                                        |
| ----------------------- | --------- | ------------------------------------------------------------ |
| `x-required-permission` | operation | the permission the key's owner needs                         |
| `x-mcp-tool`            | operation | `{ name, description }` of the MCP tool built from the route |

## Errors

Every error body is `{ "error": { "code": "<code>", "message": "<text>" } }`.

| Status | `code`             | When                                                                 |
| ------ | ------------------ | -------------------------------------------------------------------- |
| 400    | `validation_error` | a query or body field fails validation; the message names each field |
| 401    | `unauthorized`     | the header is missing, or the key is invalid, expired or revoked     |
| 403    | `forbidden`        | a limited key wasn't granted the endpoint's permission               |
| 403    | varies             | the key's owner lacks the permission                                 |
| 404    | `not_found`        | the public API is off, or the route doesn't exist                    |
| 404    | varies             | the model or record doesn't exist or isn't visible to the key        |
| 409    | varies             | the change conflicts with the record's current state                 |
| 429    | `rate_limited`     | the key's rate limit is used up                                      |
| 500    | `internal`         | unexpected server error                                              |

## Rate limits

Each key has its own token bucket, shared across every API server.

| Item                    | Value                                                    |
| ----------------------- | -------------------------------------------------------- |
| Sustained rate          | 5 requests per second (`PUBLIC_API_RATE_PER_SECOND`)     |
| Burst                   | 20 requests (`PUBLIC_API_BURST`)                         |
| `X-RateLimit-Limit`     | on every authenticated response: the bucket size         |
| `X-RateLimit-Remaining` | on every authenticated response: requests left right now |
| `Retry-After`           | on a 429: seconds to wait before retrying                |

## Related

- [Make your first API call](../build/public-api/make-your-first-api-call.md)
- [Handle errors and rate limits](../build/public-api/handle-errors-and-rate-limits.md)
- [Connect an agent through MCP](../build/agents-and-mcp/connect-an-agent-through-mcp.md)
