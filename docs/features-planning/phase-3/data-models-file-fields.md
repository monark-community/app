# Data Models — File & Attachment fields

## Context

The polymorphic Data Models engine (`@monark/data-models`, core) supports typed fields — TEXT, NUMBER, DATE, SELECT, RELATION, FORMULA, etc. — stored as JSON in each record's `data` column. It has **no file/attachment field type**. Separately, `@monark/files` (also core) already ships a complete, generic file service : a `StoredFile` model, a swappable Supabase-Storage adapter, a **signed-URL direct-to-browser upload flow** (`files.createUpload` → browser PUT → `files.finalize`), signed download URLs (`files.downloadUrl`), per-bucket size/mime policy, RBAC (`files.view` / `upload` / `delete`), events, and a `files.enabled` flag. Its README names Data Models as "the first planned consumer."

This spec adds two field types so a record can carry uploaded files, reusing the files service end-to-end (a field value is a **soft reference** to `StoredFile.id`(s), exactly like a RELATION field references record ids).

### The two field types

- **`FILE`** — a single file, optionally constrained to a set of formats. (Your "specific file + file format.")
- **`ATTACHMENTS`** — a bucket of many files, optionally constrained to certain formats and a max count. (Your "open bucket for attachments.")

They are two distinct entries in the admin field-type picker (clearest for the person building a model), but they share one client widget and one storage shape.

## Goals

- Add `FILE` and `ATTACHMENTS` to the field catalog, mirroring RELATION (`FILE` ≈ RELATION `ONE`, `ATTACHMENTS` ≈ RELATION `MANY` / MULTI_SELECT).
- A record field stores `StoredFile.id` (`FILE` → `string | null`) or `string[]` (`ATTACHMENTS`), never file bytes — reusing the existing upload + signed-download flow.
- A form widget uploads via the existing `useFileUpload()` hook and shows name + size + download + remove ; a table cell shows a filename / count chip.
- **Server-side reference validation on write** : a submitted id must resolve to a `READY` `StoredFile` in the caller's org, and satisfy the field's allowed formats / max size / max count — so a client can't stash arbitrary or cross-org ids.
- Per-field config : allowed formats, max size ; plus max count for `ATTACHMENTS`.

## Non-goals (this iteration)

- **Record-scoped file access.** `@monark/files` gates reads at the _org_ level (`files.view`), not per-record. A viewer who can reach a file field can fetch its files if they have `files.view`, regardless of whether they can see the owning record. v1 keeps org-level gating ; record-scoped ACL is deferred (see Backlog).
- **Orphan garbage collection.** Removing/replacing a file value or deleting a record does **not** delete the `StoredFile` (no GC sweep exists in `@monark/files` today). v1 accepts orphans ; a sweep is deferred.
- **Server-side file filtering** ("records that have any attachment") — `FILE`/`ATTACHMENTS` are non-filterable in v1, mirroring RELATION.
- **Thumbnails / image previews / drag-drop dropzone polish** — a simple picker + chip in v1.
- **Per-field bucket selection** — all data-model files share one default bucket.

## Design

### Storage shape (mirror RELATION)

Field value lives in `DataRecord.data` JSON as a soft reference :

- `FILE` → `StoredFile.id` string, or `null`.
- `ATTACHMENTS` → `string[]` of `StoredFile.id`.

No FK to `StoredFile` (same soft-id tradeoff RELATION uses for its targets). Structurally identical to RELATION `ONE`/`MANY`, so `valueSchemaFor`, GIN indexing, cells, and the client `defaultValueFor` all copy the RELATION branch.

### Upload + serving (reuse `@monark/files`)

- **Upload** : the widget calls `useFileUpload().upload(file, { bucket })` (`services/web/src/hooks/use-file-upload.ts`) — the 3-step signed-URL flow — and stores the returned `StoredFile.id`. Field-level format/size are checked client-side _before_ upload for UX.
- **Serving** : a chip's download action calls `trpc.files.downloadUrl` (signed, 5-min TTL for the private bucket) and opens it.
- **Hydration** : editing an existing record needs id → name/size. Add a thin **`files.byIds`** query (org-scoped, `files.view`) returning `{ id, name, size, contentType, status }[]`, wired as the FieldDef's async resolver (the RELATION `source.loadByIds` pattern).

### Default bucket

`@monark/files` seeds no bucket. Add `ensureDataModelFilesBucket()` in `data-models/server` that create-on-demands a **private** bucket named `data-model-files` (via the files server API) with no bucket-level size/mime cap — the _field_ config is the real gate, and the bucket stays permissive so one bucket serves every file field. The widget always targets this bucket.

### Server-side reference validation (the safety net)

On record create/update, after the zod value-schema pass, a new step resolves the referenced ids for each `FILE`/`ATTACHMENTS` field via a new `getReadyFilesByIds(orgId, ids)` read in `files/server`, and rejects (typed `ValidationError` naming the field) when a referenced file :

- doesn't exist, isn't `organizationId === record.org`, or isn't `status: READY` ; or
- has a `contentType` not matching the field's `allowedFormats` (exact mime or `image/*`-style prefix) ; or
- exceeds `maxSizeBytes` ; or (for `ATTACHMENTS`) the count exceeds `max`.

`@monark/data-models` → `@monark/files` is a core→core dependency, allowed.

## Data model / contract changes

- **`packages/db/prisma/base.prisma`** — add `FILE` and `ATTACHMENTS` to the `DataFieldType` enum (a migration ; `pnpm gen` then `db:migrate:dev`). No new table — the id lives in `DataRecord.data`.
- **`contracts/field-types.ts`** — add both to `DATA_FIELD_TYPES` ; add `fieldConfigSchemas` entries :
  - `FILE: { allowedFormats?: string[], maxSizeBytes?: number }`
  - `ATTACHMENTS: { allowedFormats?: string[], maxSizeBytes?: number, max?: number }`
  - `valueSchemaFor` : `FILE` copies RELATION `ONE` (nullable/required string) ; `ATTACHMENTS` copies RELATION `MANY` / MULTI_SELECT (`string[]`, `maxItems` = `max`). `valueSchemaForField` : `multiple: true` + `maxItems` from `config.max` for `ATTACHMENTS`.

## Build order (grounded in the field-type checklist)

The `DataFieldType` enum member forces exhaustiveness errors through most touchpoints, so `pnpm typecheck` enumerates the work. Two `switch`es have a `default` and won't error — `field-column.ts` `deriveSortAccessor` and the field-editor `config` memo — don't miss them.

1. **Enum + contracts** — `base.prisma` (migration), `contracts/field-types.ts` (catalog, config schemas, `valueSchemaFor`, `valueSchemaForField`).
2. **Server engine** — `server/indexing.ts` (`usesGin` += `ATTACHMENTS` ; `indexExpression` : `FILE` scalar `data->>`, `ATTACHMENTS` array `data->`) ; `server/data.ts` (the new reference-validation step in the write path ; `ensureDataModelFilesBucket`). Non-filterable, so no `fieldFilterWhere` / router change.
3. **Files module additions** — `getReadyFilesByIds(orgId, ids)` read + a `files.byIds` tRPC query (`files.view`) ; a `createBucketIfAbsent`-style helper if not already present.
4. **Web fields toolkit** (`services/web/src/components/fields/`) — mirror the RELATION path : one client `file` FieldDef (with `multiple` + `max` + `allowedFormats` + `bucket` + a `fileSource` resolver), fed by both server types via `data-field-adapter.ts` ; new `inputs/file-field.tsx` (built on `useFileUpload`, chips with name/size/download/remove) ; `registry.tsx`, `cells.tsx`, `field-icons.tsx` (paperclip), `field-column.ts`, `schema.ts`, `types.ts`, `strings.tsx`, `index.ts`.
5. **Records list** — `records-list.tsx` : `filterTypeForField` returns `null` for `file` (non-filterable) ; wire the `fileSource` resolver alongside `makeRelationSource`.
6. **Admin field editor** — `field-editor-dialog.tsx` : add `FILE` + `ATTACHMENTS` to `FIELD_TYPES`, config state + memo cases, and a per-type config block (allowed-formats input, max-size input, max-count for attachments).
7. **i18n** (en + fr) — `fields` widget strings (`uploadFile`, `uploading`, `download`, `removeFile`, `fileTooLarge`, `badFormat`, `tooManyFiles`) + `admin.dataModels.editor.fieldDialog.types.{FILE,ATTACHMENTS}` + `config.{allowedFormats,maxSizeBytes}` (reuse `config.maxItems`).
8. **Cross-cutting** — data-models emits its existing `record-*` events unchanged ; permissions unchanged (record write already gates ; upload gates on `files.upload`, download on `files.view`) ; module READMEs (`data-models`, `files`) + user/dev docs ; CHANGELOG.

## Verification

- **Integration** (data-models suite) : create a `FILE` and an `ATTACHMENTS` field ; write a record referencing a `READY` file → ok ; reject a cross-org id, a non-`READY` id, a `contentType` outside `allowedFormats`, an over-`maxSizeBytes` file, and (attachments) over-`max` count ; `files.byIds` returns metadata.
- **Manual E2E** : add a File field to a model, upload a PDF (allowed) and confirm a non-PDF is refused ; add an Attachments field, upload several images up to the max, remove one, download one, reload the record and confirm the chips rehydrate ; verify a wide record list doesn't fetch per-row file metadata.
- **Gate** : `pnpm gen && pnpm typecheck && pnpm lint && pnpm test && pnpm check:tiers && pnpm check:modules && pnpm check:i18n`.

## Deferred (fold into docs/todo/backlog.md when this ships)

- **Record-scoped file access** — gate `files.downloadUrl` (and `files.byIds`) by the caller's access to the _record_ that references the file, not just org-level `files.view`.
- **Orphan GC** — a sweep for `PENDING` files never finalized, and `READY` files no longer referenced by any record (needs a reference index or a `DataRecordFile` back-table) ; also delete storage objects on org cascade.
- **"Has attachment" filtering** — a filterable variant for `ATTACHMENTS` (`array_contains` / non-empty) once a use case appears.
- **Previews / thumbnails / drag-drop dropzone**, and **per-field bucket** selection.
