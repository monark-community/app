"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ConfirmDialog,
  DataTable,
  DiscussionSection,
  FieldRow,
  FilterBar,
  FilterBarSearch,
  PageSection,
  PanelHeader,
  TableDetailLayout,
  TableTools,
  useDataTableLayout,
  useDetailPanelRoute,
  useDiscussionPreview,
  usePaginatedList,
  type DataColumnDef,
  type FilterConfig,
  type PrimaryColumnDef,
  type TableToolsLabels,
} from "@/components/patterns";
import { DirtyFormBar } from "@/components/dirty-form-bar";
import { FIELD_TYPE_ICON } from "@/components/fields";
import { RichTextEditor } from "@/components/fields/inputs/rich-text-editor";
import { useFieldStrings } from "@/components/fields/strings";
import { trpc } from "@/lib/trpc";
import { usePaginationLabels } from "@/lib/use-pagination-labels";

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

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function IndustryFormContent({
  mode,
  onClose,
}: {
  mode:
    | { type: "create" }
    | { type: "edit"; id: string; displayName: string; slug: string; description: string | null };
  onClose: () => void;
}) {
  const t = useTranslations("admin.industries.form");
  const tCommon = useTranslations("common");
  const tSection = useTranslations("dataForm");
  const fieldStrings = useFieldStrings();
  const discussion = useDiscussionPreview();
  const utils = trpc.useUtils();

  const isEdit = mode.type === "edit";
  const [displayName, setDisplayName] = useState(isEdit ? mode.displayName : "");
  const [slugOverride, setSlugOverride] = useState(isEdit ? mode.slug : "");
  const [description, setDescription] = useState(isEdit ? (mode.description ?? "") : "");

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
    // The editor emits "" when empty ; persist that as `null` (cleared).
    const desc = description === "" ? null : description;

    if (isEdit) {
      updateMutation.mutate({ id: mode.id, displayName: name, slug, description: desc });
    } else {
      createMutation.mutate({ displayName: name, slug, description: desc });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  // Dirty vs baseline (edit) or empty form (create) — drives the save bar.
  const dirty = isEdit
    ? displayName.trim() !== mode.displayName ||
      slugOverride.trim() !== mode.slug ||
      description !== (mode.description ?? "")
    : displayName.trim() !== "" || slugOverride.trim() !== "" || description !== "";

  // Cancel = revert to baseline (panel close is the header's job).
  function revert() {
    setDisplayName(isEdit ? mode.displayName : "");
    setSlugOverride(isEdit ? mode.slug : "");
    setDescription(isEdit ? (mode.description ?? "") : "");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8 pb-20">
      <PageSection
        title={tSection("attributesTitle")}
        subtitle={tSection("attributesSubtitle")}
        contentClassName="@container flex flex-col gap-4"
      >
        <FieldRow label={t("displayName")} htmlFor="ind-name" icon={FIELD_TYPE_ICON.text}>
          <Input
            id="ind-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Fintech"
            required
            autoFocus
          />
        </FieldRow>

        <FieldRow label={t("slug")} htmlFor="ind-slug" icon={FIELD_TYPE_ICON.text}>
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
        </FieldRow>
      </PageSection>

      <PageSection title={tSection("descriptionTitle")} subtitle={tSection("descriptionSubtitle")}>
        <RichTextEditor
          id="ind-description"
          value={description}
          onChange={setDescription}
          labels={fieldStrings.labels.richText}
          placeholder={t("descriptionPlaceholder")}
          ariaLabel={t("description")}
          minHeight={40}
        />
      </PageSection>

      <PageSection title={tSection("discussionTitle")} subtitle={tSection("discussionSubtitle")}>
        <DiscussionSection {...discussion} />
      </PageSection>

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
  const tRestore = useTranslations("admin.industries.restore");
  const tArchive = useTranslations("admin.industries.archive");
  const tHardDelete = useTranslations("admin.industries.hardDelete");
  const tTable = useTranslations("table");
  const tFilters = useTranslations("filters");
  const utils = trpc.useUtils();

  const panel = useDetailPanelRoute("/data/industries", "industry");
  const industryParam = panel.selectedId;

  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch.trim(), 250);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);

  const paginationLabels = usePaginationLabels();
  const pagination = usePaginatedList({ resetKey: [search, showArchived] });

  const query = trpc.projects.industries.list.useQuery(
    {
      includeDeleted: showArchived,
      search: search.length > 0 ? search : undefined,
      limit: pagination.limit,
      cursor: pagination.cursor,
    },
    { refetchOnWindowFocus: false, placeholderData: keepPreviousData },
  );

  // The panel edits a row that may not be on the current page (deep link, or
  // paged away), so fetch it by id rather than searching the visible rows.
  const industryQuery = trpc.projects.industries.getById.useQuery(
    { id: industryParam! },
    { enabled: !panel.isCreate && !!industryParam && industryParam !== "new" },
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

  const displayRows = query.data?.items ?? [];

  const editRow = industryQuery.data;

  const sheetMode:
    | { type: "create" }
    | { type: "edit"; id: string; displayName: string; slug: string; description: string | null }
    | null =
    industryParam === "new"
      ? { type: "create" }
      : editRow
        ? {
            type: "edit",
            id: editRow.id,
            displayName: editRow.displayName,
            slug: editRow.slug,
            description: editRow.description,
          }
        : null;

  type IndustryRow = (typeof displayRows)[number];

  const layout = useDataTableLayout("industries-table");

  const filterConfigs: FilterConfig[] = [
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
  ];

  const primaryColumn: PrimaryColumnDef<IndustryRow> = {
    header: t("columns.name"),
    headerIcon: FIELD_TYPE_ICON.text,
    label: (row) => row.displayName,
    subtext: (row) =>
      row.deletedAt ? (
        <Badge variant="outline" size="sm" className="text-muted-foreground">
          {t("archivedBadge")}
        </Badge>
      ) : undefined,
    href: (row) => (row.deletedAt ? undefined : `/data/industries?industry=${row.id}`),
    enableSorting: true,
    sortAccessor: (row) => row.displayName,
  };

  const industryColumns: DataColumnDef<IndustryRow>[] = [
    {
      id: "slug",
      header: t("columns.slug"),
      headerIcon: FIELD_TYPE_ICON.text,
      cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.slug}</span>,
      enableSorting: true,
      sortAccessor: (row) => row.slug,
    },
    {
      id: "created",
      header: t("columns.created"),
      headerIcon: FIELD_TYPE_ICON.date,
      cell: (row) => (
        <span className="text-xs text-muted-foreground">{formatDate(row.createdAt)}</span>
      ),
      enableSorting: true,
      sortAccessor: (row) => new Date(row.createdAt),
    },
  ];

  const toolsLabels: TableToolsLabels = {
    tools: tTable("tools"),
    close: tFilters("close"),
    columns: tTable("columns"),
    reset: tTable("reset"),
    sort: {
      label: tTable("sorting"),
      ascending: tTable("sortAscending"),
      descending: tTable("sortDescending"),
      none: tTable("sortNone"),
      addField: tTable("sortAddField"),
      remove: tTable("sortRemove"),
      reset: tTable("sortReset"),
    },
    filters: {
      trigger: tFilters("button"),
      title: tFilters("title"),
      close: tFilters("close"),
      searchPlaceholder: tFilters("searchPlaceholder"),
      noResults: tFilters("noResults"),
      clearAll: tFilters("clearAll"),
      resetField: tFilters("resetField"),
    },
  };

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
        tools={
          <TableTools
            layout={layout}
            primaryColumn={primaryColumn}
            columns={industryColumns}
            filters={filterConfigs}
            labels={toolsLabels}
          />
        }
        actions={
          <Button onClick={panel.openCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("newIndustry")}
          </Button>
        }
      />

      <TableDetailLayout
        open={panel.isOpen}
        onClose={panel.close}
        storageKey="industries"
        panelClassName="sm:max-w-md"
        panel={
          <>
            <SheetTitle className="sr-only">
              {panel.isCreate ? t("panelCreateTitle") : t("panelEditTitle")}
            </SheetTitle>
            <PanelHeader
              title={panel.isCreate ? t("panelCreateTitle") : t("panelEditTitle")}
              onClose={panel.close}
              fullPageHref={
                !panel.isCreate && industryParam ? `/data/industries/${industryParam}` : undefined
              }
              fullPageLabel={t("openFullPage")}
            />
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {industryQuery.isLoading && !panel.isCreate && (
                <div className="space-y-4 pt-2">
                  <Skeleton className="h-7 w-40" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              )}
              {sheetMode && (
                <IndustryFormContent key={industryParam} mode={sheetMode} onClose={panel.close} />
              )}
              {!industryQuery.isLoading && !sheetMode && !panel.isCreate && (
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
            layout={layout}
            labels={{
              rowActions: tTable("rowActions"),
              errorTitle: tTable("loadError"),
              retry: tTable("retry"),
            }}
            selectedRowId={industryParam}
            isLoading={query.isLoading}
            isError={query.isError}
            onRetry={() => query.refetch()}
            emptyState={search ? t("emptyFiltered") : t("empty")}
            pagination={pagination.getFooterProps(query.data, paginationLabels)}
            primaryColumn={primaryColumn}
            columns={industryColumns}
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
