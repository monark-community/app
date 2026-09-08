# Errors

Errors are JSON: `{ "error": { "code": "…", "message": "…" } }` with a matching
HTTP status : `401` (missing/invalid/revoked/expired key), `403` (the key's
account lacks the permission, or a limited key wasn't granted it), `404`,
`400` (bad request body), `429` (rate limited).
