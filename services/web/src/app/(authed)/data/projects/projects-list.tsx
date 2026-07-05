"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ConfirmDialog,
  DataTable,
  FilterBar,
  FilterBarSearch,
  PanelHeader,
  TableDetailLayout,
  TableTools,
  reconcileColumnOrder,
  useDataTableLayout,
  useDetailPanelRoute,
  usePaginatedList,
  type DataColumnDef,
  type FilterConfig,
  type PrimaryColumnDef,
  type TableToolsLabels,
} from "@/components/patterns";
import { FIELD_TYPE_ICON } from "@/components/fields";
import { trpc } from "@/lib/trpc";
import { usePaginationLabels } from "@/lib/use-pagination-labels";
import { ProjectForm, type ProjectFieldKey, type ProjectFormInitial } from "./project-form";

// Maps a table column id → the form field it drives, so the panel form can
// render its fields in the table's configured column order. `null` = a column
// with no editable field (e.g. "updated").
const COLUMN_TO_FIELD: Record<string, ProjectFieldKey | null> = {
  status: "publicStatus",
  industries: "industries",
  url: "url",
  keywords: "keywords",
  updated: null,
};

const STATUS_OPTIONS = ["IDEA", "PROTOTYPE_AVAILABLE", "IN_PROGRESS", "QA", "COMPLETED"] as const;
type StatusValue = (typeof STATUS_OPTIONS)[number];

const STATUS_BADGE_VARIANT: Record<
  (typeof STATUS_OPTIONS)[number],
  "primary" | "secondary" | "success" | "warning" | "outline"
> = {
  IDEA: "outline",
  PROTOTYPE_AVAILABLE: "secondary",
  IN_PROGRESS: "primary",
  QA: "warning",
  COMPLETED: "success",
};

type ConfirmMode =
  | null
  | { type: "archive"; id: string; title: string }
  | { type: "hard-delete"; id: string; title: string };

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function ProjectsList() {
  const t = useTranslations("admin.projects");
  const tStatus = useTranslations("admin.projects.status");
  const tActions = useTranslations("admin.projects.actions");
  const tArchive = useTranslations("admin.projects.archive");
  const tHardDelete = useTranslations("admin.projects.hardDelete");
  const tRestore = useTranslations("admin.projects.restore");
  const tTable = useTranslations("table");
  const tFilters = useTranslations("filters");
  const utils = trpc.useUtils();

  const panel = useDetailPanelRoute("/data/projects", "project");
  const projectParam = panel.selectedId;
  const isCreateMode = panel.isCreate;

  const [showArchived, setShowArchived] = useState(false);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);

  // Archive = soft delete (sets deletedAt) ; restorable. Hard delete is
  // permanent, only offered on already-archived rows — mirrors industries.
  const archiveMutation = trpc.projects.delete.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(tArchive("success"));
      utils.projects.list.invalidate();
      if (variables.id === projectParam) panel.close();
      setConfirmMode(null);
    },
    onError: (err) => toast.error(tArchive("error", { message: err.message })),
  });

  const restoreMutation = trpc.projects.restore.useMutation({
    onSuccess: () => {
      toast.success(tRestore("success"));
      utils.projects.list.invalidate();
    },
    onError: (err) => toast.error(tRestore("error", { message: err.message })),
  });

  const hardDeleteMutation = trpc.projects.delete.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(tHardDelete("success"));
      utils.projects.list.invalidate();
      if (variables.id === projectParam) panel.close();
      setConfirmMode(null);
    },
    onError: (err) => toast.error(tHardDelete("error", { message: err.message })),
  });

  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch.trim(), 250);
  const [statusFilter, setStatusFilter] = useState<StatusValue[]>([]);
  const [industryFilter, setIndustryFilter] = useState<string[]>([]);

  // Filter dropdown wants every industry as an option ; page at the max size.
  const industriesQuery = trpc.projects.industries.list.useQuery(
    { limit: 100 },
    {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  );

  const paginationLabels = usePaginationLabels();
  const pagination = usePaginatedList({
    resetKey: [search, statusFilter, industryFilter, showArchived],
  });

  const query = trpc.projects.list.useQuery(
    {
      publicStatuses: statusFilter.length > 0 ? statusFilter : undefined,
      industryIds: industryFilter.length > 0 ? industryFilter : undefined,
      search: search.length > 0 ? search : undefined,
      includeDeleted: showArchived,
      limit: pagination.limit,
      cursor: pagination.cursor,
    },
    {
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
    },
  );

  const projectQuery = trpc.projects.getById.useQuery(
    { id: projectParam! },
    { enabled: !isCreateMode && !!projectParam },
  );

  const rows = query.data?.items ?? [];
  const isFiltered = search.length > 0 || statusFilter.length > 0 || industryFilter.length > 0;

  const rtf = useMemo(() => new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }), []);
  function formatRelative(iso: string | Date): string {
    const date = iso instanceof Date ? iso : new Date(iso);
    const deltaSec = (date.getTime() - Date.now()) / 1000;
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ["year", 60 * 60 * 24 * 365],
      ["month", 60 * 60 * 24 * 30],
      ["day", 60 * 60 * 24],
      ["hour", 60 * 60],
      ["minute", 60],
    ];
    for (const [unit, secInUnit] of units) {
      if (Math.abs(deltaSec) >= secInUnit) {
        return rtf.format(Math.round(deltaSec / secInUnit), unit);
      }
    }
    return rtf.format(Math.round(deltaSec), "second");
  }

  const projectInitial: ProjectFormInitial | undefined = useMemo(() => {
    const p = projectQuery.data;
    if (!p) return undefined;
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      url: p.url,
      description: p.description,
      publicStatus: p.publicStatus,
      keywords: p.keywords,
      industries: p.industries.map((ind) => ({
        id: ind.id,
        displayName: ind.displayName,
      })),
    };
  }, [projectQuery.data]);

  type ProjectRow = (typeof rows)[number];

  const layout = useDataTableLayout("projects-table");

  const filterConfigs: FilterConfig[] = [
    {
      id: "status",
      type: "multiSelect",
      label: t("filterStatusLabel"),
      value: statusFilter,
      onValueChange: (v) => setStatusFilter(v as StatusValue[]),
      options: STATUS_OPTIONS.map((s) => ({ value: s, label: tStatus(s) })),
    },
    {
      id: "industry",
      type: "multiSelect",
      label: t("filterIndustryLabel"),
      value: industryFilter,
      onValueChange: setIndustryFilter,
      options: (industriesQuery.data?.items ?? []).map((ind) => ({
        value: ind.id,
        label: ind.displayName,
      })),
    },
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

  const primaryColumn: PrimaryColumnDef<ProjectRow> = {
    header: t("columns.title"),
    headerIcon: FIELD_TYPE_ICON.text,
    label: (p) => p.title,
    subtext: (p) =>
      p.deletedAt ? (
        <span className="flex items-center gap-2">
          <span>{p.slug}</span>
          <Badge variant="outline" size="sm" className="text-muted-foreground">
            {t("archivedBadge")}
          </Badge>
        </span>
      ) : (
        p.slug
      ),
    href: (p) => (p.deletedAt ? undefined : `/data/projects?project=${p.id}`),
    enableSorting: true,
    sortAccessor: (p) => p.title,
  };

  const projectColumns: DataColumnDef<ProjectRow>[] = [
    {
      id: "status",
      header: t("columns.status"),
      headerIcon: FIELD_TYPE_ICON.singleSelect,
      cell: (p) => (
        <Badge variant={STATUS_BADGE_VARIANT[p.publicStatus]} size="sm">
          {tStatus(p.publicStatus)}
        </Badge>
      ),
      enableSorting: true,
      sortAccessor: (p) => tStatus(p.publicStatus),
    },
    {
      id: "url",
      header: t("columns.url"),
      headerIcon: FIELD_TYPE_ICON.url,
      cell: (p) =>
        p.url ? (
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer noopener"
            // Opens the external site ; the row's primary label owns row
            // selection, so this link doesn't clash with opening the panel.
            className="block truncate font-mono text-xs text-primary hover:underline"
          >
            {p.url}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      enableSorting: true,
      sortAccessor: (p) => p.url ?? "",
    },
    {
      id: "keywords",
      header: t("columns.keywords"),
      headerIcon: FIELD_TYPE_ICON.multiSelect,
      cell: (p) =>
        p.keywords.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {p.keywords.slice(0, 3).map((k) => (
              <Badge key={k} variant="secondary" size="sm">
                {k}
              </Badge>
            ))}
            {p.keywords.length > 3 && (
              <span className="text-xs text-muted-foreground">+{p.keywords.length - 3}</span>
            )}
          </div>
        ),
    },
    {
      id: "industries",
      header: t("columns.industries"),
      headerIcon: FIELD_TYPE_ICON.relation,
      cell: (p) =>
        p.industries.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {p.industries.slice(0, 3).map((ind) => (
              <Link
                key={ind.id}
                href={`/data/industries?industry=${ind.id}`}
                className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Badge
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer hover:bg-secondary/70"
                >
                  {ind.displayName}
                </Badge>
              </Link>
            ))}
            {p.industries.length > 3 && (
              <span className="text-xs text-muted-foreground">+{p.industries.length - 3}</span>
            )}
          </div>
        ),
    },
    {
      id: "updated",
      header: t("columns.updated"),
      headerIcon: FIELD_TYPE_ICON.datetime,
      cell: (p) => (
        <span className="text-xs text-muted-foreground">{formatRelative(p.updatedAt)}</span>
      ),
      enableSorting: true,
      sortAccessor: (p) => new Date(p.updatedAt),
    },
  ];

  // The panel form renders its fields in the table's configured column order
  // (reactive to TableTools reordering) : title/slug lead, the data columns
  // map to their fields in order, Description is always last. Every field
  // still shows regardless of column visibility.
  const fieldOrder: ProjectFieldKey[] = [
    "title",
    "slug",
    ...reconcileColumnOrder(
      layout.columnOrder,
      projectColumns.map((c) => c.id),
    )
      .map((id) => COLUMN_TO_FIELD[id])
      .filter((k): k is ProjectFieldKey => !!k),
    "description",
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
      valueCount: (count) => tFilters("activeValues", { count }),
    },
  };

  return (
    <>
      <div className="space-y-4">
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
              columns={projectColumns}
              filters={filterConfigs}
              labels={toolsLabels}
            />
          }
          actions={
            <Button onClick={panel.openCreate}>
              <Plus className="h-4 w-4" aria-hidden />
              {t("newProject")}
            </Button>
          }
        />

        <TableDetailLayout
          open={panel.isOpen}
          onClose={panel.close}
          storageKey="projects"
          panelClassName="sm:max-w-xl"
          panel={
            <>
              <SheetTitle className="sr-only">
                {isCreateMode ? t("panelCreateTitle") : t("panelEditTitle")}
              </SheetTitle>
              <PanelHeader
                title={isCreateMode ? t("panelCreateTitle") : t("panelEditTitle")}
                onClose={panel.close}
                fullPageHref={
                  !isCreateMode && projectParam ? `/data/projects/${projectParam}` : undefined
                }
                fullPageLabel={t("openFullPage")}
              />
              <div className="flex-1 overflow-y-auto px-6 py-6">
                {isCreateMode && (
                  <ProjectForm
                    key="new"
                    mode="create"
                    onClose={panel.close}
                    containment="container"
                    fieldOrder={fieldOrder}
                  />
                )}
                {!isCreateMode && projectQuery.isLoading && (
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                )}
                {!isCreateMode && projectQuery.isError && (
                  <p className="text-sm text-muted-foreground">{t("notFound")}</p>
                )}
                {!isCreateMode && projectInitial && (
                  <ProjectForm
                    key={projectParam}
                    mode="edit"
                    initial={projectInitial}
                    onClose={panel.close}
                    containment="container"
                    fieldOrder={fieldOrder}
                  />
                )}
              </div>
            </>
          }
          table={
            <DataTable
              data={rows}
              getRowId={(p) => p.id}
              storageKey="projects-table"
              layout={layout}
              labels={{
                rowActions: tTable("rowActions"),
                errorTitle: tTable("loadError"),
                retry: tTable("retry"),
              }}
              selectedRowId={projectParam}
              isLoading={query.isLoading}
              isError={query.isError}
              onRetry={() => query.refetch()}
              emptyState={isFiltered ? t("emptyFiltered") : t("empty")}
              pagination={pagination.getFooterProps(query.data, paginationLabels)}
              primaryColumn={primaryColumn}
              columns={projectColumns}
              rowActions={(p) =>
                p.deletedAt
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
                            title: r.title,
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
                            title: r.title,
                          }),
                      },
                    ]
              }
            />
          }
        />
      </div>

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
          name: confirmMode?.type === "hard-delete" ? confirmMode.title : "",
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
