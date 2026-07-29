import { getDb, type Prisma } from "@monark/db";
import {
  cursorFindArgs,
  resolveLimit,
  toPage,
  type Paginated,
  type PaginationArgs,
} from "@monark/common/pagination";

export type FileBucketRow = Prisma.FileBucketGetPayload<Record<string, never>>;
export type StoredFileRow = Prisma.StoredFileGetPayload<Record<string, never>>;

// ── Buckets ───────────────────────────────────────────────

export async function createBucketRow(input: {
  name: string;
  isPublic: boolean;
  fileSizeLimit?: number | null;
  allowedMimeTypes?: string[];
  createdBy: string;
}): Promise<FileBucketRow> {
  return getDb().fileBucket.create({
    data: {
      name: input.name,
      isPublic: input.isPublic,
      fileSizeLimit: input.fileSizeLimit ?? null,
      allowedMimeTypes: input.allowedMimeTypes ?? [],
      createdBy: input.createdBy,
    },
  });
}

/** All buckets, ordered by name. Bounded (buckets are a small operator set), so
 *  intentionally not cursor-paginated. */
export async function listBuckets(): Promise<FileBucketRow[]> {
  return getDb().fileBucket.findMany({ orderBy: { name: "asc" } });
}

export async function findBucketByName(name: string): Promise<FileBucketRow | null> {
  return getDb().fileBucket.findUnique({ where: { name } });
}

// ── Files ─────────────────────────────────────────────────

export async function createPendingFile(input: {
  id: string;
  organizationId: string;
  bucket: string;
  key: string;
  name: string;
  contentType: string;
  size: number;
  uploadedBy: string;
}): Promise<StoredFileRow> {
  return getDb().storedFile.create({ data: { ...input, status: "PENDING" } });
}

export async function markFileReady(
  id: string,
  update: { size: number; contentType?: string },
): Promise<StoredFileRow> {
  return getDb().storedFile.update({
    where: { id },
    data: {
      status: "READY",
      size: update.size,
      // Overwrite the client-declared content type with the one storage actually
      // observed, so the persisted type can't be spoofed at createUpload time.
      ...(update.contentType ? { contentType: update.contentType } : {}),
    },
  });
}

export async function findFileById(
  id: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
): Promise<StoredFileRow | null> {
  return getDb().storedFile.findFirst({
    where: { id, ...(includeDeleted ? {} : { deletedAt: null }) },
  });
}

export async function softDeleteFile(id: string): Promise<void> {
  await getDb().storedFile.update({ where: { id }, data: { deletedAt: new Date() } });
}

/**
 * READY, non-deleted files in one org whose id is in `ids`. Used to hydrate a
 * Data Model file-field's chips and to validate its references on record write.
 * Missing / cross-org / non-ready ids simply don't appear in the result, so the
 * caller can diff against the requested ids to reject bad references.
 */
export async function getReadyFilesByIds(
  organizationId: string,
  ids: string[],
): Promise<StoredFileRow[]> {
  if (ids.length === 0) return [];
  return getDb().storedFile.findMany({
    where: { organizationId, status: "READY", deletedAt: null, id: { in: ids } },
  });
}

export type ListFilesInput = PaginationArgs & {
  organizationId: string;
  /** Restrict to a single bucket ; omit for all of the org's files. */
  bucket?: string;
};

/** READY, non-deleted files for one org (newest first), cursor-paginated. */
export async function listFiles(input: ListFilesInput): Promise<Paginated<StoredFileRow>> {
  const db = getDb();
  const where: Prisma.StoredFileWhereInput = {
    organizationId: input.organizationId,
    status: "READY",
    deletedAt: null,
    ...(input.bucket ? { bucket: input.bucket } : {}),
  };
  const limit = resolveLimit(input.limit);
  const [rows, total] = await Promise.all([
    db.storedFile.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...cursorFindArgs(limit, input.cursor),
    }),
    db.storedFile.count({ where }),
  ]);
  return toPage(rows, total, limit);
}
