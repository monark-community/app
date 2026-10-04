---
type: concept
---

# Files

Monark stores uploaded files in Supabase Storage through one core service, `@monark/files`. The API decides who may upload what and keeps the record of every file, but the bytes never pass through it: the browser uploads straight to storage with a short-lived signed URL. Data-model file fields and achievement badge images both use this service.

## Buckets and organizations

A bucket is a storage container with its own rules: public or private, a size limit, and allowed file types. Buckets are platform-wide, because a storage bucket belongs to the whole Supabase project. Organizations are kept apart inside a bucket instead:

- Every file's storage path starts with its organization id: `{organizationId}/{fileId}-{safe file name}`.
- Every file record carries its organization, and every read and write checks the caller's organization and permission first.

Buckets are private by default. A private file is reached only through a signed URL minted by the server, valid for five minutes, so no storage access policy is needed per bucket. A public bucket returns a plain public URL instead; badge images use one so they can be cached.

| Bucket              | Visibility | Used by                                                                                                |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| `data-model-files`  | private    | every data-model file and attachments field; the field's own allowed types and size are the real limit |
| `achievement-icons` | public     | achievement badge images                                                                               |
| admin-created       | either     | files uploaded on the **Files** admin page                                                             |

Both built-in buckets are created at API boot. A deployment without storage configured logs a warning and carries on; uploads then fail with a clear error.

## The upload flow

```
 browser                       API                              storage
   │ 1. createUpload ─────────▶ check bucket rules,
   │                            save file as PENDING,
   │ ◀──────── signed URL ───── ask storage for a one-time upload URL
   │ 2. upload bytes ─────────────────────────────────────────────▶ │
   │ 3. finalize ─────────────▶ read the stored object's real size and type,
   │                            re-check the bucket rules,
   │ ◀──────────── file ─────── mark READY, emit files.file-uploaded
```

The size and type a browser declares in step 1 can't be trusted, so step 3 checks what storage actually holds. An object that breaks the rules is deleted and the file never becomes ready. Only ready files appear in lists or can be attached. A file whose upload never finishes stays pending and is ignored.

Data models add one more check when a record is saved: every file id in a file field must be a ready file in the same organization, of an allowed type and size, within the field's file count. A client can't attach another organization's file or an arbitrary id.

Deleting a file removes the object from storage on a best-effort basis and soft-deletes the record, so a storage hiccup never blocks the delete.

## Storage backends

The router talks only to a small storage interface. Supabase is the one implementation today; another backend, such as S3, would be a second implementation of the same interface. Tests swap in a fake, so the router suite runs without Supabase.

## Why it's a core module

Extended modules may not depend on each other, so a service that several features reuse has to be core. Its tables live in the core schema, not in a module fragment.

## Permissions and events

| Permission             | Allows                       |
| ---------------------- | ---------------------------- |
| `files.view`           | list files and download them |
| `files.upload`         | upload files                 |
| `files.delete`         | delete files                 |
| `files.manage-buckets` | create buckets               |

Every change emits an event (`files.bucket-created`, `files.file-uploaded`, `files.file-deleted`), so webhooks can subscribe to them. The **Files** admin page sits behind the `files.enabled` feature flag, on by default. Files send no notifications.

## Limits

- No image transforms or thumbnails.
- No resumable or multipart uploads.
- No sharing or access rules on individual files beyond organization and permission.
- No storage quotas.
- Pending uploads that never finish, and objects left behind by a failed storage delete, aren't cleaned up automatically.

## Related

- [Data models and queries](data-models-and-queries.md)
- [How achievements are awarded](achievements.md)
- [files package README](../../packages/files/README.md)
