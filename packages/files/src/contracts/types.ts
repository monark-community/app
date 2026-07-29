// Pure, serializable domain types shared by the files server + its consumers
// (no Prisma imports, so the web bundle can depend on them).

export type StoredFileStatus = "PENDING" | "READY";

/** A storage bucket (mirrors a Supabase Storage bucket + its upload policy). */
export type BucketDef = {
  id: string;
  name: string;
  isPublic: boolean;
  /** Max object size in bytes (undefined = no explicit cap). */
  fileSizeLimit?: number;
  /** Allowed MIME types ; empty = any type is accepted. */
  allowedMimeTypes: string[];
};

/** A stored file's metadata row (org-scoped). */
export type StoredFileItem = {
  id: string;
  organizationId: string;
  bucket: string;
  key: string;
  name: string;
  contentType: string;
  size: number;
  status: StoredFileStatus;
  uploadedBy: string;
  createdAt: Date;
};

/** Signed-upload ticket returned by `files.createUpload` — the browser uploads
 *  the bytes to `signedUrl` (or via `uploadToSignedUrl(key, token, file)`),
 *  then calls `files.finalize({ fileId })`. */
export type UploadTicket = {
  fileId: string;
  bucket: string;
  key: string;
  token: string;
  signedUrl: string;
};

/** Max length we keep of a user-supplied filename (before extension math). */
export const MAX_FILENAME_LENGTH = 200;

/**
 * Turn a user filename into a storage-safe path segment : strip path
 * separators + unsafe characters, collapse repeats, bound the length. Keeps
 * dots (so the extension survives). Never empty.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .trim()
    .slice(0, MAX_FILENAME_LENGTH)
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return cleaned.length > 0 ? cleaned : "file";
}

/**
 * The object key for a stored file : `{organizationId}/{fileId}-{safeName}`.
 * Org-prefixed so a single bucket partitions many orgs' files ; the `fileId`
 * (a cuid) makes it collision-free.
 */
export function buildObjectKey(organizationId: string, fileId: string, name: string): string {
  return `${organizationId}/${fileId}-${sanitizeFilename(name)}`;
}
