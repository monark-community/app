import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Backend-agnostic storage port. The Supabase implementation is the default ;
// the router reaches storage only through `getFileStorage()`, and tests swap in
// a fake via `setFileStorageForTesting()`. Keeping this behind an interface is
// what lets a future backend (S3, GCS) drop in without touching the router.

export type CreateBucketInput = {
  name: string;
  isPublic: boolean;
  /** Bytes ; `null` = no explicit cap. */
  fileSizeLimit?: number | null;
  allowedMimeTypes?: string[];
};

export type SignedUpload = { signedUrl: string; token: string; path: string };
export type ObjectInfo = { size: number; contentType: string | null };

export interface FileStorage {
  createBucket(input: CreateBucketInput): Promise<void>;
  createSignedUploadUrl(bucket: string, key: string): Promise<SignedUpload>;
  /** Metadata for an object, or `null` if it isn't there yet. */
  getObjectInfo(bucket: string, key: string): Promise<ObjectInfo | null>;
  createSignedDownloadUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string>;
  getPublicUrl(bucket: string, key: string): string;
  removeObject(bucket: string, key: string): Promise<void>;
}

let client: SupabaseClient | undefined;
function admin(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "@monark/files requires SUPABASE_URL + SUPABASE_SECRET_KEY in the api environment.",
    );
  }
  client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return client;
}

/** The Supabase Storage implementation of {@link FileStorage} (service key). */
export function supabaseFileStorage(): FileStorage {
  return {
    async createBucket(input) {
      const allowed = input.allowedMimeTypes?.length ? input.allowedMimeTypes : undefined;
      const { error } = await admin().storage.createBucket(input.name, {
        public: input.isPublic,
        fileSizeLimit: input.fileSizeLimit ?? undefined,
        allowedMimeTypes: allowed,
      });
      if (error) throw new Error(`storage.createBucket failed: ${error.message}`);
    },
    async createSignedUploadUrl(bucket, key) {
      const { data, error } = await admin().storage.from(bucket).createSignedUploadUrl(key);
      if (error || !data) {
        throw new Error(`storage.createSignedUploadUrl failed: ${error?.message ?? "no data"}`);
      }
      return { signedUrl: data.signedUrl, token: data.token, path: data.path };
    },
    async getObjectInfo(bucket, key) {
      // `list` the object's folder and match the filename — available on every
      // supabase-js version (unlike the newer `.info()`).
      const slash = key.lastIndexOf("/");
      const folder = slash >= 0 ? key.slice(0, slash) : "";
      const filename = slash >= 0 ? key.slice(slash + 1) : key;
      const { data, error } = await admin()
        .storage.from(bucket)
        .list(folder, { search: filename, limit: 100 });
      if (error) throw new Error(`storage.list failed: ${error.message}`);
      const match = data?.find((o) => o.name === filename);
      if (!match) return null;
      const meta = (match.metadata ?? {}) as { size?: number; mimetype?: string };
      return { size: meta.size ?? 0, contentType: meta.mimetype ?? null };
    },
    async createSignedDownloadUrl(bucket, key, expiresInSeconds) {
      const { data, error } = await admin()
        .storage.from(bucket)
        .createSignedUrl(key, expiresInSeconds);
      if (error || !data) {
        throw new Error(`storage.createSignedUrl failed: ${error?.message ?? "no data"}`);
      }
      return data.signedUrl;
    },
    getPublicUrl(bucket, key) {
      return admin().storage.from(bucket).getPublicUrl(key).data.publicUrl;
    },
    async removeObject(bucket, key) {
      const { error } = await admin().storage.from(bucket).remove([key]);
      if (error) throw new Error(`storage.remove failed: ${error.message}`);
    },
  };
}

let override: FileStorage | undefined;
let cached: FileStorage | undefined;

export function getFileStorage(): FileStorage {
  if (override) return override;
  cached ??= supabaseFileStorage();
  return cached;
}

/** Test seam : inject a fake storage (pass `undefined` to restore the default). */
export function setFileStorageForTesting(impl: FileStorage | undefined): void {
  override = impl;
}
