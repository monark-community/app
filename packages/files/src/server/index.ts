import { randomUUID } from "node:crypto";
import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import {
  ConflictError,
  emit,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@monark/common";
import { requireOrg } from "@monark/organizations/server";
import { hasSysadminAssignment, requirePermission } from "@monark/rbac/server";
import { buildObjectKey } from "../contracts/types";
import type { BucketDef, StoredFileItem } from "../contracts/types";
import type {
  FilesBucketCreatedEvent,
  FilesFileDeletedEvent,
  FilesFileUploadedEvent,
} from "../contracts/events";
import type { FileBucketRow, StoredFileRow } from "./data";
import {
  createBucketRow,
  createPendingFile,
  findBucketByName,
  findFileById,
  getReadyFilesByIds,
  listBuckets,
  listFiles,
  markFileReady,
  softDeleteFile,
} from "./data";
import { getFileStorage } from "./storage";

// Signed download URLs are short-lived ; the browser fetches immediately.
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
// Hard ceiling on a single upload regardless of the bucket policy (5 GiB).
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
// Supabase bucket naming : lowercase alphanumerics + dashes, 3–63 chars.
const BUCKET_NAME = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/,
    "Use lowercase letters, numbers and dashes (3–63 chars).",
  );

function toBucketDef(b: FileBucketRow): BucketDef {
  return {
    id: b.id,
    name: b.name,
    isPublic: b.isPublic,
    fileSizeLimit: b.fileSizeLimit ?? undefined,
    allowedMimeTypes: b.allowedMimeTypes,
  };
}

function toFileItem(f: StoredFileRow): StoredFileItem {
  return {
    id: f.id,
    organizationId: f.organizationId,
    bucket: f.bucket,
    key: f.key,
    name: f.name,
    contentType: f.contentType,
    size: f.size,
    status: f.status,
    uploadedBy: f.uploadedBy,
    createdAt: f.createdAt,
  };
}

export const filesRouter = router({
  // ── Buckets ──────────────────────────────────────────────
  buckets: router({
    create: publicProcedure
      .input(
        z.object({
          name: BUCKET_NAME,
          isPublic: z.boolean().default(false),
          fileSizeLimit: z.number().int().positive().max(MAX_FILE_SIZE).nullable().optional(),
          allowedMimeTypes: z.array(z.string().min(1).max(255)).max(50).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const actorId = await requirePermission(ctx, "files.manage-buckets", org.id);
        // A public bucket serves stable, unauthenticated, non-expiring URLs, so
        // creating one is a platform-tier decision (SYSADMIN) — an org-tier
        // `files.manage-buckets` holder can only create private buckets.
        if (input.isPublic && !(await hasSysadminAssignment(ctx.userId))) {
          throw new ForbiddenError(
            "Public buckets can only be created by a platform administrator (SYSADMIN).",
          );
        }
        if (await findBucketByName(input.name)) {
          throw new ConflictError(`A bucket named "${input.name}" already exists.`);
        }
        // A null limit is fine: `finalize` re-checks the real object size against
        // `bucket.fileSizeLimit ?? MAX_FILE_SIZE`, so an unbounded bucket is still
        // capped at the hard per-file ceiling in app code. (The column is INT4,
        // so we can't store the 5 GiB ceiling here anyway.)
        const fileSizeLimit = input.fileSizeLimit ?? null;
        await getFileStorage().createBucket({
          name: input.name,
          isPublic: input.isPublic,
          fileSizeLimit,
          allowedMimeTypes: input.allowedMimeTypes,
        });
        const bucket = await createBucketRow({
          name: input.name,
          isPublic: input.isPublic,
          fileSizeLimit,
          allowedMimeTypes: input.allowedMimeTypes,
          createdBy: actorId,
        });
        const event: FilesBucketCreatedEvent = {
          type: "files.bucket-created",
          bucket: bucket.name,
          isPublic: bucket.isPublic,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event);
        return toBucketDef(bucket);
      }),

    list: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "files.view", org.id);
      return (await listBuckets()).map(toBucketDef);
    }),
  }),

  // ── Files (top-level under `trpc.files.*`) ───────────────
  // Step 1 of the signed-upload flow : validate against the bucket policy,
  // record a PENDING file, and mint a one-shot signed upload URL. The client
  // uploads the bytes to it, then calls `finalize`.
  createUpload: publicProcedure
    .input(
      z.object({
        bucket: z.string().min(1),
        filename: z.string().trim().min(1).max(200),
        contentType: z.string().min(1).max(255),
        size: z.number().int().min(0).max(MAX_FILE_SIZE),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      const actorId = await requirePermission(ctx, "files.upload", org.id);
      const bucket = await findBucketByName(input.bucket);
      if (!bucket) throw new NotFoundError("FileBucket", input.bucket);
      if (bucket.fileSizeLimit != null && input.size > bucket.fileSizeLimit) {
        throw new ValidationError(
          `File exceeds the bucket's size limit of ${bucket.fileSizeLimit} bytes.`,
        );
      }
      if (
        bucket.allowedMimeTypes.length > 0 &&
        !bucket.allowedMimeTypes.includes(input.contentType)
      ) {
        throw new ValidationError(`Content type "${input.contentType}" is not allowed here.`);
      }
      const fileId = randomUUID();
      const key = buildObjectKey(org.id, fileId, input.filename);
      await createPendingFile({
        id: fileId,
        organizationId: org.id,
        bucket: bucket.name,
        key,
        name: input.filename,
        contentType: input.contentType,
        size: input.size,
        uploadedBy: actorId,
      });
      const signed = await getFileStorage().createSignedUploadUrl(bucket.name, key);
      return {
        fileId,
        bucket: bucket.name,
        key,
        token: signed.token,
        signedUrl: signed.signedUrl,
      };
    }),

  // Step 2 : confirm the object landed, capture its real size, flip to READY.
  finalize: publicProcedure
    .input(z.object({ fileId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      const actorId = await requirePermission(ctx, "files.upload", org.id);
      const file = await findFileById(input.fileId);
      if (!file || file.organizationId !== org.id) {
        throw new NotFoundError("StoredFile", input.fileId);
      }
      const info = await getFileStorage().getObjectInfo(file.bucket, file.key);
      if (!info) {
        throw new ValidationError(
          "The object is not in storage yet ; upload it before finalizing.",
        );
      }
      // The size + content type declared at createUpload were client-controlled.
      // Reconcile against what storage actually holds and re-validate the bucket
      // policy here, so a client can't bypass the size/MIME gate by lying up
      // front then uploading arbitrary bytes/type. On violation, delete the
      // stray object and reject (the row stays PENDING, never becomes READY).
      const realSize = info.size || file.size;
      const realType = info.contentType ?? file.contentType;
      const bucket = await findBucketByName(file.bucket);
      {
        // Enforce the bucket's limit, or the hard ceiling for a policy-less
        // bucket, so an uploaded object can never exceed MAX_FILE_SIZE even if
        // the client under-declared its size at createUpload.
        const sizeLimit = bucket?.fileSizeLimit ?? MAX_FILE_SIZE;
        const overSize = realSize > sizeLimit;
        const badType =
          (bucket?.allowedMimeTypes.length ?? 0) > 0 &&
          !bucket?.allowedMimeTypes.includes(realType);
        if (overSize || badType) {
          await getFileStorage()
            .removeObject(file.bucket, file.key)
            .catch(() => {});
          throw new ValidationError(
            overSize
              ? `File exceeds the size limit of ${sizeLimit} bytes.`
              : `Content type "${realType}" is not allowed in this bucket.`,
          );
        }
      }
      const ready = await markFileReady(file.id, { size: realSize, contentType: realType });
      const event: FilesFileUploadedEvent = {
        type: "files.file-uploaded",
        fileId: ready.id,
        organizationId: org.id,
        bucket: ready.bucket,
        key: ready.key,
        name: ready.name,
        contentType: ready.contentType,
        size: ready.size,
        actorId,
        occurredAt: new Date(),
      };
      await emit(event);
      return toFileItem(ready);
    }),

  list: publicProcedure
    .input(
      z.object({
        bucket: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "files.view", org.id);
      const page = await listFiles({
        organizationId: org.id,
        bucket: input.bucket,
        limit: input.limit,
        cursor: input.cursor,
      });
      return { items: page.items.map(toFileItem), nextCursor: page.nextCursor, total: page.total };
    }),

  // Resolve metadata for a set of file ids (READY + in the caller's org) —
  // used by a Data Model file-field to hydrate its chips (name / size / type)
  // from the stored `StoredFile.id`s without exposing bytes. Missing ids are
  // simply omitted.
  byIds: publicProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).max(100) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "files.view", org.id);
      const rows = await getReadyFilesByIds(org.id, input.ids);
      return rows.map(toFileItem);
    }),

  downloadUrl: publicProcedure
    .input(z.object({ fileId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "files.view", org.id);
      const file = await findFileById(input.fileId);
      if (!file || file.organizationId !== org.id) {
        throw new NotFoundError("StoredFile", input.fileId);
      }
      const bucket = await findBucketByName(file.bucket);
      const storage = getFileStorage();
      const url = bucket?.isPublic
        ? storage.getPublicUrl(file.bucket, file.key)
        : await storage.createSignedDownloadUrl(file.bucket, file.key, DOWNLOAD_URL_TTL_SECONDS);
      return { url };
    }),

  remove: publicProcedure
    .input(z.object({ fileId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      const actorId = await requirePermission(ctx, "files.delete", org.id);
      const file = await findFileById(input.fileId);
      if (!file || file.organizationId !== org.id) {
        throw new NotFoundError("StoredFile", input.fileId);
      }
      // Best-effort object removal — a soft-deleted row must not be blocked by
      // a storage hiccup (a periodic sweep can reconcile orphans later).
      await getFileStorage()
        .removeObject(file.bucket, file.key)
        .catch(() => {});
      await softDeleteFile(file.id);
      const event: FilesFileDeletedEvent = {
        type: "files.file-deleted",
        fileId: file.id,
        organizationId: org.id,
        bucket: file.bucket,
        key: file.key,
        actorId,
        occurredAt: new Date(),
      };
      await emit(event);
      return { id: file.id };
    }),
});

/**
 * Idempotently ensure a bucket (storage object + `FileBucket` row) exists.
 * Lets a consumer module (e.g. Data Models file fields) provision the bucket
 * it uploads into without an operator having to create one first. Safe to call
 * repeatedly ; a concurrent create that loses the unique-name race is swallowed.
 */
export async function ensureBucket(input: {
  name: string;
  isPublic?: boolean;
  fileSizeLimit?: number | null;
  allowedMimeTypes?: string[];
  createdBy?: string;
}): Promise<void> {
  if (await findBucketByName(input.name)) return;
  // `finalize` caps the real object size at `fileSizeLimit ?? MAX_FILE_SIZE`, so
  // a null limit is still bounded at the hard ceiling in app code.
  const fileSizeLimit = input.fileSizeLimit ?? null;
  await getFileStorage().createBucket({
    name: input.name,
    isPublic: input.isPublic ?? false,
    fileSizeLimit,
    allowedMimeTypes: input.allowedMimeTypes,
  });
  try {
    await createBucketRow({
      name: input.name,
      isPublic: input.isPublic ?? false,
      fileSizeLimit,
      allowedMimeTypes: input.allowedMimeTypes ?? [],
      createdBy: input.createdBy ?? "system",
    });
  } catch {
    // Lost the unique-name race with a concurrent ensure — the row now exists.
  }
}

// Read interface for consumer modules (Data Models file-field validation).
export { getReadyFilesByIds } from "./data";
export type { StoredFileRow } from "./data";

// Re-export the boot-time registration helpers + the storage seam.
export { registerFilesPermissions } from "./permissions";
export { registerFilesEventTypes } from "./event-types";
export { registerFilesFeatureFlags } from "./flags";
export { getFileStorage, setFileStorageForTesting } from "./storage";
export type { FileStorage } from "./storage";
