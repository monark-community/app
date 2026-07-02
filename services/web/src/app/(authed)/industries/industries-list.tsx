"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ConfirmDialog,
  DataTable,
  FilterBar,
  FilterBarSearch,
  FilterMenu,
  PanelHeaderBar,
  TableDetailLayout,
  useDetailPanelRoute,
} from "@/components/patterns";
import { DirtyFormBar } from "@/components/dirty-form-bar";
import { trpc } from "@/lib/trpc";

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

type ConfirmMode =
  | null
  | { type: "archive"; id: string; displayName: string }
  | { type: "hard-delete"; id: string; displayName: string };

function formatDate(iso: Date | string): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function IndustryFormContent({
  mode,
  onClose,
}: {
  mode: { type: "create" } | { type: "edit"; id: string; displayName: string; slug: string };
  onClose: () => void;
}) {
  const t = useTranslations("admin.industries.form");
  const tCommon = useTranslations("common");
  const utils = trpc.useUtils();

  const isEdit = mode.type === "edit";
  const [displayName, setDisplayName] = useState(isEdit ? mode.displayName : "");
  const [slugOverride, setSlugOverride] = useState(isEdit ? mode.slug : "");

  const slugPreview = useMemo(() => {
    const trimmed = slugOverride.trim();
    if (trimmed.length > 0) return trimmed;
    return slugify(displayName) || "";
  }, [displayName, slugOverride]);

  const createMutation = trpc.projects.industries.create.useMutation({
    onSuccess: () => {
      toast.success(t("createSuccess"));
      utils.projects.industries.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(t("createError", { message: err.message })),
  });

  const updateMutation = trpc.projects.industries.update.useMutation({
    onSuccess: () => {
      toast.success(t("updateSuccess"));
      utils.projects.industries.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(t("updateError", { message: err.message })),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function submit() {
    const name = displayName.trim();
    if (!name) return;
    const slug = slugOverride.trim() || undefined;

    if (isEdit) {
      updateMutation.mutate({ id: mode.id, displayName: name, slug });
    } else {
      createMutation.mutate({ displayName: name, slug });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  // Dirty vs baseline (edit) or empty form (create) — drives the save bar.
  const dirty = isEdit
    ? displayName.trim() !== mode.displayName || slugOverride.trim() !== mode.slug
    : displayName.trim() !== "" || slugOverride.trim() !== "";

  // Cancel = revert to baseline (panel close is the header's job).
  function revert() {
    setDisplayName(isEdit ? mode.displayName : "");
    setSlugOverride(isEdit ? mode.slug : "");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 pb-20">
      <SheetHeader>
        <SheetTitle>{isEdit ? t("editTitle") : t("createTitle")}</SheetTitle>
      </SheetHeader>

      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="ind-name">{t("displayName")}</Label>
          <Input
            id="ind-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Fintech"
            required
            autoFocus
          />
          <p className="text-xs text-muted-foreground">{t("displayNameHelp")}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ind-slug">{t("slug")}</Label>
          <Input
            id="ind-slug"
            value={slugOverride}
            onChange={(e) => setSlugOverride(e.target.value.toLowerCase())}
            placeholder={slugPreview || "fintech"}
          />
          {slugPreview && (
            <p className="text-xs text-muted-foreground">
              {t("slugPreview", { slug: slugPreview })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t("slugHelp")}</p>
        </div>
      </div>

      <DirtyFormBar
        containment="container"
        open={dirty}
        saving={isPending}
        onSave={submit}
        onCancel={revert}
        saveLabel={isEdit ? t("save") : t("create")}
        savingLabel={isEdit ? t("saving") : t("creating")}
        cancelLabel={t("cancel")}
        message={tCommon("unsavedChanges")}
      />
    </form>
  );
}

export function IndustriesList() {
  const t = useTranslations("admin.industries");
  const tActions = useTranslations("admin.industries.actions");
  const tForm = useTranslations("admin.industries.form");
  const tRestore = useTranslations("admin.industries.restore");
  const tArchive = useTranslations("admin.industries.archive");
  const tHardDelete = useTranslations("admin.industries.hardDelete");
  const tTable = useTranslations("table");
  const tFilters = useTranslations("filters");
  const utils = trpc.useUtils();

  const panel = useDetailPanelRoute("/industries", "industry");
  const industryParam = panel.selectedId;

  const [rawSearch, setRawSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);

  const query = trpc.projects.industries.list.useQuery(
    { includeDeleted: showArchived },
    { refetchOnWindowFocus: false },
  );

  const restoreMutation = trpc.projects.industries.restore.useMutation({
    onSuccess: () => {
      toast.success(tRestore("success"));
      utils.projects.industries.list.invalidate();
    },
    onError: (err) => toast.error(tRestore("error", { message: err.message })),
  });

  const archiveMutation = trpc.projects.industries.delete.useMutation({
    onSuccess: () => {
      toast.success(tArchive("success"));
      utils.projects.industries.list.invalidate();
      setConfirmMode(null);
    },
    onError: (err) => toast.error(tArchive("error", { message: err.message })),
  });

  const hardDeleteMutation = trpc.projects.industries.delete.useMutation({
    onSuccess: () => {
      toast.success(tHardDelete("success"));
      utils.projects.industries.list.invalidate();
      setConfirmMode(null);
    },
    onError: (err) => toast.error(tHardDelete("error", { message: err.message })),
  });

  const updateMutation = trpc.projects.industries.update.useMutation({
    onSuccess: () => {
      toast.success(tForm("updateSuccess"));
      utils.projects.industries.list.invalidate();
    },
    onError: (err) => toast.error(tForm("updateError", { message: err.message })),
  });

  const rows = query.data ?? [];
  const active = rows.filter((r) => !r.deletedAt);
  const search = rawSearch.trim().toLowerCase();
  const base = showArchived ? rows : active;
  const displayRows = search
    ? base.filter(
        (r) =>
          r.displayName.toLowerCase().includes(search) || r.slug.toLowerCase().includes(search),
      )
    : base;

  const editRow = rows.find((r) => r.id === industryParam);

  const sheetMode:
    | { type: "create" }
    | { type: "edit"; id: string; displayName: string; slug: string }
    | null =
    industryParam === "new"
      ? { type: "create" }
      : editRow
        ? { type: "edit", id: editRow.id, displayName: editRow.displayName, slug: editRow.slug }
        : null;

  return (
    <>
      <FilterBar
        search={
          <FilterBarSearch
            value={rawSearch}
            onChange={setRawSearch}
            placeholder={t("searchPlaceholder")}
          />
        }
        filter={
          <FilterMenu
            labels={{
              trigger: tFilters("button"),
              title: tFilters("title"),
              close: tFilters("close"),
            }}
            filters={[
              {
                id: "archived",
                label: t("archivedFilterLabel"),
                value: showArchived ? "all" : "active",
                onValueChange: (v) => setShowArchived(v === "all"),
                options: [
                  { value: "active", label: t("activeOnly") },
                  { value: "all", label: t("includeArchived") },
                ],
              },
            ]}
          />
        }
        actions={
          <Button size="sm" onClick={panel.openCreate}>
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            {t("newIndustry")}
          </Button>
        }
      />

      <TableDetailLayout
        open={panel.isOpen}
        onClose={panel.close}
        panelClassName="sm:max-w-md"
        panel={
          <>
            <PanelHeaderBar
              onCollapse={panel.close}
              collapseLabel={t("collapsePanel")}
              fullPageHref={
                !panel.isCreate && industryParam ? `/industries/${industryParam}` : undefined
              }
              fullPageLabel={t("openFullPage")}
            />
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {query.isLoading && !panel.isCreate && (
                <div className="space-y-4 pt-2">
                  <Skeleton className="h-7 w-40" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              )}
              {sheetMode && (
                <IndustryFormContent key={industryParam} mode={sheetMode} onClose={panel.close} />
              )}
              {!query.isLoading && !sheetMode && !panel.isCreate && (
                <p className="text-sm text-muted-foreground">{t("notFound")}</p>
              )}
            </div>
          </>
        }
        table={
          <DataTable
            data={displayRows}
            getRowId={(row) => row.id}
            storageKey="industries-table"
            labels={{
              columns: tTable("columns"),
              reset: tTable("reset"),
              rowActions: tTable("rowActions"),
              openPanel: tTable("openPanel"),
              errorTitle: tTable("loadError"),
              retry: tTable("retry"),
            }}
            selectedRowId={industryParam}
            isLoading={query.isLoading}
            isError={query.isError}
            onRetry={() => query.refetch()}
            emptyState={
              search
                ? t("emptyFiltered")
                : showArchived && active.length > 0
                  ? t("emptyArchived")
                  : t("empty")
            }
            primaryColumn={{
              header: t("columns.name"),
              label: (row) => row.displayName,
              subtext: (row) =>
                row.deletedAt ? (
                  <Badge variant="outline" size="sm" className="text-muted-foreground">
                    {t("archivedBadge")}
                  </Badge>
                ) : undefined,
              href: (row) => (row.deletedAt ? undefined : `/industries?industry=${row.id}`),
              enableSorting: true,
              sortAccessor: (row) => row.displayName,
              edit: {
                getValue: (row) => row.displayName,
                maxLength: 80,
                onSave: (row, value) => updateMutation.mutate({ id: row.id, displayName: value }),
              },
            }}
            columns={[
              {
                id: "slug",
                header: t("columns.slug"),
                cell: (row) => (
                  <span className="font-mono text-xs text-muted-foreground">{row.slug}</span>
                ),
                enableSorting: true,
                sortAccessor: (row) => row.slug,
                edit: {
                  getValue: (row) => row.slug,
                  onSave: (row, value) => updateMutation.mutate({ id: row.id, slug: value }),
                },
              },
              {
                id: "created",
                header: t("columns.created"),
                cell: (row) => (
                  <span className="text-xs text-muted-foreground">{formatDate(row.createdAt)}</span>
                ),
                enableSorting: true,
                sortAccessor: (row) => new Date(row.createdAt),
              },
            ]}
            rowActions={(row) =>
              row.deletedAt
                ? [
                    {
                      label: tActions("restore"),
                      icon: RotateCcw,
                      onSelect: (r) => restoreMutation.mutate({ id: r.id }),
                    },
                    {
                      label: tActions("delete"),
                      icon: Trash2,
                      destructive: true,
                      separatorBefore: true,
                      onSelect: (r) =>
                        setConfirmMode({
                          type: "hard-delete",
                          id: r.id,
                          displayName: r.displayName,
                        }),
                    },
                  ]
                : [
                    {
                      label: tActions("edit"),
                      icon: Pencil,
                      onSelect: (r) => panel.open(r.id),
                    },
                    {
                      label: tActions("archive"),
                      icon: Archive,
                      onSelect: (r) =>
                        setConfirmMode({
                          type: "archive",
                          id: r.id,
                          displayName: r.displayName,
                        }),
                    },
                  ]
            }
          />
        }
      />

      <ConfirmDialog
        open={confirmMode?.type === "archive"}
        onOpenChange={(open) => {
          if (!open) setConfirmMode(null);
        }}
        title={tArchive("title")}
        description={tArchive("description")}
        cancelLabel={tArchive("cancel")}
        confirmLabel={tArchive("cta")}
        isPending={archiveMutation.isPending}
        onConfirm={() => {
          if (confirmMode?.type === "archive") archiveMutation.mutate({ id: confirmMode.id });
        }}
      />

      <ConfirmDialog
        open={confirmMode?.type === "hard-delete"}
        onOpenChange={(open) => {
          if (!open) setConfirmMode(null);
        }}
        title={tHardDelete("title", {
          name: confirmMode?.type === "hard-delete" ? confirmMode.displayName : "",
        })}
        description={tHardDelete("description")}
        cancelLabel={tHardDelete("cancel")}
        confirmLabel={tHardDelete("cta")}
        isPending={hardDeleteMutation.isPending}
        onConfirm={() => {
          if (confirmMode?.type === "hard-delete")
            hardDeleteMutation.mutate({ id: confirmMode.id, hard: true });
        }}
      />
    </>
  );
}
