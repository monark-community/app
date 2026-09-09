# What you can call (v1)

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
