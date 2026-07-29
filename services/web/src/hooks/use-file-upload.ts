"use client";

import { useCallback, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { trpc } from "@/lib/trpc";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export type UploadedFile = {
  id: string;
  name: string;
  bucket: string;
  size: number;
  contentType: string;
};

/**
 * The signed-upload flow, orchestrated client-side :
 *   1. `files.createUpload` — the API validates the bucket policy, records a
 *      PENDING file, and returns a one-shot signed upload URL.
 *   2. upload the bytes DIRECTLY to Supabase Storage (they never touch the API).
 *   3. `files.finalize` — the API confirms the object landed and flips it READY.
 *
 * Returns `{ upload, status, error }`. `upload(file, { bucket })` resolves with
 * the stored-file metadata (or throws).
 */
export function useFileUpload() {
  const createUpload = trpc.files.createUpload.useMutation();
  const finalize = trpc.files.finalize.useMutation();
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File, opts: { bucket: string }): Promise<UploadedFile> => {
      setStatus("uploading");
      setError(null);
      try {
        const contentType = file.type || "application/octet-stream";
        const ticket = await createUpload.mutateAsync({
          bucket: opts.bucket,
          filename: file.name,
          contentType,
          size: file.size,
        });

        const supabase = createSupabaseBrowserClient();
        const { error: uploadError } = await supabase.storage
          .from(ticket.bucket)
          .uploadToSignedUrl(ticket.key, ticket.token, file, { contentType });
        if (uploadError) throw new Error(uploadError.message);

        const stored = await finalize.mutateAsync({ fileId: ticket.fileId });
        setStatus("success");
        return {
          id: stored.id,
          name: stored.name,
          bucket: stored.bucket,
          size: stored.size,
          contentType: stored.contentType,
        };
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "Upload failed.");
        throw e;
      }
    },
    [createUpload, finalize],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return { upload, reset, status, error, isUploading: status === "uploading" };
}
