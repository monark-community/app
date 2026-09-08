# Files module

`@monark/files` is a **core** module providing a generic file-upload service :
buckets + org-scoped files, backed by Supabase Storage. This is the internals
reference ; the package [`README`](../../packages/files/README.md) is the API doc.

## Why core

Extended modules may not depend on other extended modules, so a service meant to
be reused (Data Models file attachments, and later Kanban/etc.) must be **core**.
Its models live in the core schema source `packages/db/prisma/base.prisma` under
the `// ── MODULE: files ──` banner (migration `20260728120000_add_files`), not a
module fragment (fragments are for extended modules).

## The signed-upload flow

The API is authoritative but never handles the bytes:

1. **`files.createUpload`** : validates the request against the `FileBucket`
   policy (`fileSizeLimit`, `allowedMimeTypes`), computes the object key
   `{organizationId}/{fileId}-{sanitizeFilename(name)}`, writes a `PENDING`
   `StoredFile`, and asks storage for a one-shot **signed upload URL**
   (`createSignedUploadUrl`). Returns `{ fileId, bucket, key, token, signedUrl }`.
2. **Browser upload** : the web `useFileUpload` hook uploads the `File` straight
   to Supabase with `supabase.storage.from(bucket).uploadToSignedUrl(key, token,
file)` (the bytes never touch the API).
3. **`files.finalize`** : confirms the object exists (`getObjectInfo`, capturing
   the real size), flips the row to `READY`, and emits `files.file-uploaded`.

Only `READY` files appear in `files.list`. A `PENDING` row whose upload never
completes is a harmless orphan (a future sweep can prune it).

## Buckets, org scoping, access

A Supabase bucket is project-level, so `FileBucket` is **global infra** ;
multi-tenancy comes from the **key prefix** (`{organizationId}/…`) and the
`StoredFile.organizationId` column, and every read/write is org-scoped through
`requireOrg` + `requirePermission`. Buckets are created **private** ; the signed
upload/download URL (minted with the service key) is the gate, so no per-bucket
RLS policy is needed (unlike the older avatar path). Public buckets are supported
(`isPublic`) and then `downloadUrl` returns the public URL.

## Storage adapter

`server/storage.ts` defines the `FileStorage` port and a Supabase implementation
(lazy service-key client from `SUPABASE_URL` + `SUPABASE_SECRET_KEY`). The router
only ever calls `getFileStorage()`, and `setFileStorageForTesting(fake)` lets the
router suite run with no real Supabase. A different backend (S3, GCS) is a new
implementation of the same interface.

## Cross-cutting wiring (the "Big 5")

Registered at api boot in [`services/api/src/server.ts`](../../services/api/src/server.ts):

- **RBAC** : `files.{view, upload, delete, manage-buckets}`, guarded on every
  mutation.
- **Event bus** : `files.{bucket-created, file-uploaded, file-deleted}`.
- **Webhooks** : free : `registerFilesEventTypes()` makes every event subscribable.
- **Feature flags** : `files.enabled` (default-on) gates the `/admin/files` page.
- **Notifications** : N/A for now (a conscious choice).

## Web

`services/web/src/hooks/use-file-upload.ts` (`useFileUpload`) orchestrates
createUpload → uploadToSignedUrl → finalize. The admin surface lives at
[`/admin/files`](<../../services/web/src/app/(authed)/admin/files>) : a
`FilesManager` client with a bucket picker/target, a **New bucket** dialog
(name / public / size / MIME policy), an upload control, and a `DataTable` of
files with Download + Delete row actions. Registered in `admin-tabs.ts`.

## Testing

- **Unit** (`pnpm --filter @monark/files test`) : `sanitizeFilename` /
  `buildObjectKey` (path-traversal + collision safety).
- **Integration** (`pnpm --filter @monark/files test:integration`, Docker) : the
  data layer (bucket CRUD, pending→ready, READY-only + paginated list,
  soft-delete) and the **router** via `t.createCallerFactory` with a fake
  `FileStorage` : RBAC deny/allow, `createUpload` policy rejection (over-size /
  wrong MIME), the finalize→READY flow, and event emission
  (`bucket-created` / `file-uploaded` / `file-deleted`).

## Deferred

Data-Models integration (a file field type + a record↔file join), image
transforms/thumbnails, resumable/multipart uploads, per-file ACL/sharing, quota
accounting.
