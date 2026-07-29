# @monark/files

A generic **file-upload service** : create storage buckets, upload arbitrary
files (tracked with metadata), list / download / delete them. Built as a `core`
module so any module can consume it (the first planned consumer is Data Models —
attaching files to a record). Backed by **Supabase Storage**.

## What's here

- **`contracts/`** — pure, transport-safe types (`BucketDef`, `StoredFileItem`,
  `UploadTicket`), the `sanitizeFilename` / `buildObjectKey` helpers, and the
  `FilesEvents` domain-event union (`events.ts`).
- **`server/`** — the tRPC router (`index.ts`, exported as `filesRouter`), the
  Prisma data layer (`data.ts`), the swappable **storage adapter** (`storage.ts`),
  and permission / event-type / feature-flag registration.

The models live in the core schema (`packages/db/prisma/base.prisma`, under the
`// ── MODULE: files ──` banner), migration `20260728120000_add_files`.

## Key concepts

- **Signed-upload flow** — the API never sees the bytes. `files.createUpload`
  validates the bucket policy, records a `PENDING` file, and mints a one-shot
  **signed upload URL** ; the browser uploads directly to Supabase
  (`uploadToSignedUrl`) ; `files.finalize` confirms the object landed (captures
  the real size) and flips it `READY`. The API stays authoritative over policy +
  metadata without proxying large files.
- **Buckets vs files** — a `FileBucket` is project-level infra (mirrors a Supabase
  bucket + its size / MIME policy). A `StoredFile` is **org-scoped**, partitioned
  within a bucket by key prefix `{organizationId}/{fileId}-{safeName}`, so one
  bucket holds many orgs' files. Buckets are **private** ; the signed URL (not
  RLS) is the access gate, and downloads use a short-lived signed URL.
- **Swappable storage** — the router reaches storage only through a `FileStorage`
  interface (`getFileStorage()`), with a Supabase implementation and a
  `setFileStorageForTesting()` seam. A future S3/GCS backend drops in without
  touching the router.

## Public API

| Export                                                        | From         | Purpose                                               |
| ------------------------------------------------------------- | ------------ | ----------------------------------------------------- |
| `filesRouter`                                                 | `/server`    | tRPC router (`buckets` + top-level file ops)          |
| `registerFilesPermissions()`                                  | `/server`    | registers `files.{view,upload,delete,manage-buckets}` |
| `registerFilesEventTypes()`                                   | `/server`    | registers the webhook-picker descriptions             |
| `registerFilesFeatureFlags()`                                 | `/server`    | registers the `files.enabled` flag                    |
| `getFileStorage` / `setFileStorageForTesting` / `FileStorage` | `/server`    | the storage seam                                      |
| `BucketDef` / `StoredFileItem` / `UploadTicket`               | `/contracts` | domain types                                          |
| `sanitizeFilename` / `buildObjectKey`                         | `/contracts` | storage-key helpers                                   |
| `FilesEvents`                                                 | `/contracts` | domain-event union                                    |

## Data model

- **`FileBucket`** — `name` (unique, the Supabase bucket), `isPublic`,
  `fileSizeLimit?` (bytes), `allowedMimeTypes` (empty = any), `createdBy`.
- **`StoredFile`** — org-scoped ; `bucket`, `key` (unique), `name`,
  `contentType`, `size`, `status` (`PENDING` / `READY`), `uploadedBy`,
  soft-deleted (`deletedAt`). Indexed on `organizationId`, `bucket`, `status`.

## Events emitted

`files.bucket-created`, `files.file-uploaded`, `files.file-deleted`. Registered
for the webhook picker via `registerFilesEventTypes()`, so every one is
webhook-subscribable with no webhook code.

## Feature flags

`registerFilesFeatureFlags()` registers `files.enabled` (default-on) — a kill
switch ; the `/admin/files` page 404s when it resolves `false`.

## tRPC surface (`trpc.files.*`)

- `buckets.{create, list}` — `create` needs `files.manage-buckets`.
- `createUpload` (`files.upload`) — validate policy, record PENDING, return a
  signed upload URL.
- `finalize` (`files.upload`) — confirm + flip to READY, emit `file-uploaded`.
- `list` (`files.view`) — READY, org-scoped, cursor-paginated (optional `bucket`).
- `downloadUrl` (`files.view`) — a signed (or public) URL.
- `remove` (`files.delete`) — remove the object + soft-delete the row, emit
  `file-deleted`.

Every mutation guards with `requirePermission(ctx, "files.<key>", orgId)`.

## Not yet

Image transforms / thumbnails, resumable uploads, per-file ACL / sharing (reads
are org-scoped, not per-record), quota accounting, and orphan GC (a sweep for
never-finalized `PENDING` rows and files no longer referenced by any record).

**Landed:** Data-Models integration — a Data Model `FILE` / `ATTACHMENTS` field
stores a soft `StoredFile.id` reference, uploads via `useFileUpload`, hydrates
chips via `files.byIds`, and serves via `files.downloadUrl` ; the shared
`data-model-files` bucket is auto-provisioned (`ensureBucket`).
