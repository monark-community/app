"use client";

import { useMemo, useRef, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Download, File as FileIcon, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ConfirmDialog,
  DataTable,
  usePaginatedList,
  type DataColumnDef,
  type PrimaryColumnDef,
} from "@/components/patterns";
import { useFileUpload } from "@/hooks/use-file-upload";
import { formatRelativeTime } from "@/lib/format-time";
import { trpc } from "@/lib/trpc";
import { usePaginationLabels } from "@/lib/use-pagination-labels";

const ALL_BUCKETS = "__all__";

type FileRow = {
  id: string;
  name: string;
  bucket: string;
  contentType: string;
  size: number;
  createdAt: string | Date;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || Number.isInteger(value) ? 0 : 1)} ${units[unit]}`;
}

export function FilesManager() {
  const t = useTranslations("admin.files");
  const locale = useLocale();
  const utils = trpc.useUtils();
  const paginationLabels = usePaginationLabels();
  const { upload, isUploading } = useFileUpload();

  const [bucket, setBucket] = useState<string>(ALL_BUCKETS);
  const [createBucketOpen, setCreateBucketOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FileRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bucketsQuery = trpc.files.buckets.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const buckets = bucketsQuery.data ?? [];

  const pagination = usePaginatedList({ resetKey: [bucket] });
  const filesQuery = trpc.files.list.useQuery(
    {
      bucket: bucket === ALL_BUCKETS ? undefined : bucket,
      limit: pagination.limit,
      cursor: pagination.cursor,
    },
    { placeholderData: keepPreviousData, refetchOnWindowFocus: false },
  );

  const removeMutation = trpc.files.remove.useMutation({
    onSuccess: () => {
      setConfirmDelete(null);
      void utils.files.list.invalidate();
      toast.success(t("deletedToast"));
    },
    onError: (err) => toast.error(t("errorToast", { message: err.message })),
  });

  const rows: FileRow[] = useMemo(
    () =>
      (filesQuery.data?.items ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        bucket: f.bucket,
        contentType: f.contentType,
        size: f.size,
        createdAt: f.createdAt,
      })),
    [filesQuery.data],
  );

  async function handleDownload(row: FileRow) {
    try {
      const { url } = await utils.files.downloadUrl.fetch({ fileId: row.id });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(t("errorToast", { message: err instanceof Error ? err.message : "" }));
    }
  }

  async function handleFilePicked(file: File | undefined) {
    if (!file || bucket === ALL_BUCKETS) return;
    try {
      await upload(file, { bucket });
      void utils.files.list.invalidate();
      toast.success(t("uploadedToast", { name: file.name }));
    } catch (err) {
      toast.error(t("errorToast", { message: err instanceof Error ? err.message : "" }));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const primaryColumn: PrimaryColumnDef<FileRow> = {
    header: t("table.name"),
    label: (row) => row.name,
    subtext: (row) => row.contentType,
    leading: () => <FileIcon className="h-4 w-4 text-muted-foreground" aria-hidden />,
  };

  const columns: DataColumnDef<FileRow>[] = [
    {
      id: "bucket",
      header: t("table.bucket"),
      cell: (row) => <span className="text-muted-foreground">{row.bucket}</span>,
    },
    {
      id: "size",
      header: t("table.size"),
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatBytes(row.size)}</span>,
    },
    {
      id: "uploaded",
      header: t("table.uploaded"),
      cell: (row) => (
        <span className="text-muted-foreground">{formatRelativeTime(row.createdAt, locale)}</span>
      ),
    },
  ];

  const canUpload = bucket !== ALL_BUCKETS && buckets.length > 0;

  return (
    <div className="space-y-4">
      {/* Toolbar : bucket filter/target, upload, create bucket. */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={bucket} onValueChange={setBucket}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_BUCKETS}>{t("allBuckets")}</SelectItem>
            {buckets.map((b) => (
              <SelectItem key={b.id} value={b.name}>
                {b.name}
                {b.isPublic ? ` · ${t("public")}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => void handleFilePicked(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!canUpload || isUploading}
          onClick={() => fileInputRef.current?.click()}
          title={canUpload ? undefined : t("pickBucketHint")}
        >
          <Upload className="mr-1 h-4 w-4" aria-hidden />
          {isUploading ? t("uploading") : t("uploadCta")}
        </Button>

        <div className="ml-auto">
          <Button type="button" onClick={() => setCreateBucketOpen(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            {t("newBucketCta")}
          </Button>
        </div>
      </div>

      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        primaryColumn={primaryColumn}
        columns={columns}
        storageKey="admin-files"
        isLoading={filesQuery.isLoading}
        isError={filesQuery.isError}
        onRetry={() => void filesQuery.refetch()}
        labels={{
          rowActions: t("table.rowActions"),
          errorTitle: t("table.errorTitle"),
          retry: t("table.retry"),
        }}
        emptyState={
          <p className="text-sm text-muted-foreground">
            {buckets.length === 0 ? t("empty.noBuckets") : t("empty.noFiles")}
          </p>
        }
        rowActions={() => [
          {
            label: t("actions.download"),
            icon: Download,
            onSelect: (r) => void handleDownload(r),
          },
          {
            label: t("actions.delete"),
            icon: Trash2,
            destructive: true,
            separatorBefore: true,
            onSelect: (r) => setConfirmDelete(r),
          },
        ]}
        pagination={filesQuery.data && pagination.getFooterProps(filesQuery.data, paginationLabels)}
      />

      {createBucketOpen && (
        <CreateBucketDialog
          onClose={() => setCreateBucketOpen(false)}
          onCreated={(name) => {
            setCreateBucketOpen(false);
            void utils.files.buckets.list.invalidate();
            setBucket(name);
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={t("deleteConfirmTitle")}
        description={t("deleteConfirmBody", { name: confirmDelete?.name ?? "" })}
        cancelLabel={t("cancel")}
        confirmLabel={t("actions.delete")}
        isPending={removeMutation.isPending}
        onConfirm={() => {
          if (confirmDelete) removeMutation.mutate({ fileId: confirmDelete.id });
        }}
      />
    </div>
  );
}

function CreateBucketDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const t = useTranslations("admin.files.bucketDialog");
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [sizeLimitMb, setSizeLimitMb] = useState("");
  const [mimeTypes, setMimeTypes] = useState("");

  const createMutation = trpc.files.buckets.create.useMutation({
    onSuccess: (bucket) => {
      toast.success(t("createdToast", { name: bucket.name }));
      onCreated(bucket.name);
    },
    onError: (err) => toast.error(err.message),
  });

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const mb = sizeLimitMb.trim();
    const fileSizeLimit = mb ? Math.round(Number.parseFloat(mb) * 1024 * 1024) : null;
    if (mb && (!Number.isFinite(fileSizeLimit) || (fileSizeLimit ?? 0) <= 0)) {
      toast.error(t("sizeInvalid"));
      return;
    }
    const allowedMimeTypes = mimeTypes
      .split(",")
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
    createMutation.mutate({
      name: trimmed,
      isPublic,
      fileSizeLimit,
      allowedMimeTypes: allowedMimeTypes.length > 0 ? allowedMimeTypes : undefined,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="bucket-name">{t("nameLabel")}</Label>
            <Input
              id="bucket-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground">{t("nameHint")}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            {t("publicLabel")}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bucket-size">{t("sizeLabel")}</Label>
              <Input
                id="bucket-size"
                type="number"
                min={0}
                step="1"
                inputMode="numeric"
                value={sizeLimitMb}
                onChange={(e) => setSizeLimitMb(e.target.value)}
                placeholder={t("sizePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bucket-mimes">{t("mimeLabel")}</Label>
              <Input
                id="bucket-mimes"
                value={mimeTypes}
                onChange={(e) => setMimeTypes(e.target.value)}
                placeholder={t("mimePlaceholder")}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
