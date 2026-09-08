# Files

`/admin/files`. Manage the org's uploaded files. Files are stored via a signed-upload flow (the server never handles the bytes) into private buckets ; a Data Model `FILE` / `ATTACHMENTS` field is the most common source. The page lists the org's files with size + type, offers a short-lived signed download link, and lets you remove a file (object deleted + row soft-deleted). Gated by the `files.enabled` flag ; actions gate on the `files.*` permissions.
