"use client";

import { Paperclip, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFormContext, type ControllerRenderProps } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormControl, FormField } from "@/components/ui/form";
import { useFileUpload } from "@/hooks/use-file-upload";
import { FieldShell } from "../field-shell";
import type { FieldInputProps, FileFieldDef, FileMeta } from "../types";

/** Client-side mirror of the server's MIME check : exact ("application/pdf")
 *  or wildcard prefix ("image/*") ; an empty list accepts anything. */
function mimeAllowed(contentType: string, allowedFormats: string[] | undefined): boolean {
  if (!allowedFormats || allowedFormats.length === 0) return true;
  const ct = contentType.toLowerCase();
  return allowedFormats.some((fmt) => {
    const f = fmt.toLowerCase();
    return f.endsWith("/*") ? ct.startsWith(f.slice(0, -1)) : ct === f;
  });
}

function FileControl({
  def,
  labels,
  field,
}: {
  def: FileFieldDef;
  labels: FieldInputProps["labels"];
  field: ControllerRenderProps;
}) {
  const multiple = def.multiple ?? false;
  const value = field.value as string[] | string | null;
  const ids: string[] = multiple
    ? ((value as string[] | undefined) ?? [])
    : value
      ? [value as string]
      : [];
  const idsKey = ids.join(",");

  const [cache, setCache] = useState<Record<string, FileMeta>>({});
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading, error: uploadError } = useFileUpload();

  // Hydrate metadata (name / size) for already-stored ids in edit mode.
  useEffect(() => {
    const missing = ids.filter((id) => !cache[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void def.source
      .loadByIds(missing)
      .then((metas) => {
        if (cancelled) return;
        setCache((prev) => ({ ...prev, ...Object.fromEntries(metas.map((m) => [m.id, m])) }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  const atCapacity = multiple && def.max != null && ids.length >= def.max;

  async function onPick(file: File | undefined): Promise<void> {
    if (!file) return;
    setError(null);
    const contentType = file.type || "application/octet-stream";
    if (!mimeAllowed(contentType, def.allowedFormats)) {
      setError(labels.badFileFormat);
      return;
    }
    if (def.maxSizeBytes != null && file.size > def.maxSizeBytes) {
      setError(labels.fileTooLarge);
      return;
    }
    try {
      const uploaded = await upload(file, { bucket: def.bucket });
      setCache((prev) => ({
        ...prev,
        [uploaded.id]: {
          id: uploaded.id,
          name: uploaded.name,
          size: uploaded.size,
          contentType: uploaded.contentType,
        },
      }));
      field.onChange(multiple ? [...ids, uploaded.id] : uploaded.id);
    } catch {
      // `useFileUpload` captured the message in `uploadError` (surfaced below).
    }
  }

  function removeId(id: string): void {
    field.onChange(multiple ? ids.filter((x) => x !== id) : null);
  }

  async function download(id: string): Promise<void> {
    const url = await def.source.getDownloadUrl(id).catch(() => "");
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  const uploadButton =
    !def.disabled && !atCapacity ? (
      <FormControl>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          {isUploading ? labels.uploading : labels.uploadFile}
        </Button>
      </FormControl>
    ) : null;

  const chips = ids.map((id) => {
    const meta = cache[id];
    const name = meta?.name ?? labels.uploading;
    return (
      <span
        key={id}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-input bg-muted/40 py-1 pl-2 pr-1 text-sm"
      >
        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <button
          type="button"
          onClick={() => void download(id)}
          aria-label={labels.downloadFile(name)}
          className="min-w-0 truncate hover:underline"
        >
          {name}
        </button>
        {!def.disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0"
            aria-label={labels.remove(name)}
            onClick={() => removeId(id)}
          >
            <X className="h-3 w-3" aria-hidden />
          </Button>
        ) : null}
      </span>
    );
  });

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={def.allowedFormats?.join(",")}
        className="hidden"
        onChange={(e) => {
          void onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {multiple ? (
          <>
            {chips}
            {uploadButton}
          </>
        ) : ids.length > 0 ? (
          chips
        ) : (
          uploadButton
        )}
      </div>
      {(error ?? uploadError) ? (
        <p className="text-xs text-destructive">{error ?? uploadError}</p>
      ) : null}
    </div>
  );
}

export function FileField({ def, labels }: FieldInputProps<FileFieldDef>) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={def.name}
      render={({ field }) => (
        <FieldShell def={def}>
          <FileControl def={def} labels={labels} field={field} />
        </FieldShell>
      )}
    />
  );
}
