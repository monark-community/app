"use client";

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
  FilterMenu,
  PanelHeaderBar,
  TableDetailLayout,
  useDetailPanelRoute,
} from "@/components/patterns";
import { trpc } from "@/lib/trpc";
import { ProjectForm, type ProjectFormInitial } from "./project-form";

const STATUS_OPTIONS = ["IDEA", "PROTOTYPE_AVAILABLE", "IN_PROGRESS", "QA", "COMPLETED"] as const;
type StatusFilter = "all" | (typeof STATUS_OPTIONS)[number];

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
  const tForm = useTranslations("admin.projects.form");
  const tTable = useTranslations("table");
  const tFilters = useTranslations("filters");
  const utils = trpc.useUtils();

  const panel = useDetailPanelRoute("/projects", "project");
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

  const updateMutation = trpc.projects.update.useMutation({
    onSuccess: () => {
      toast.success(tForm("updateSuccess"));
      utils.projects.list.invalidate();
      utils.projects.getById.invalidate();
    },
    onError: (err) => toast.error(tForm("updateError", { message: err.message })),
  });

  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch.trim(), 250);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");

  const industriesQuery = trpc.projects.industries.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const query = trpc.projects.list.useQuery(
    {
      publicStatus: statusFilter !== "all" ? statusFilter : undefined,
      industryId: industryFilter !== "all" ? industryFilter : undefined,
      search: search.length > 0 ? search : undefined,
      includeDeleted: showArchived,
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

  const rows = query.data ?? [];
  const isFiltered = search.length > 0 || statusFilter !== "all" || industryFilter !== "all";

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
          filter={
            <FilterMenu
              labels={{
                trigger: tFilters("button"),
                title: tFilters("title"),
                close: tFilters("close"),
              }}
              filters={[
                {
                  id: "status",
                  label: t("filterStatusLabel"),
                  value: statusFilter,
                  onValueChange: (v) => setStatusFilter(v as StatusFilter),
                  options: [
                    { value: "all", label: t("filterStatusAll") },
                    ...STATUS_OPTIONS.map((s) => ({
                      value: s,
                      label: tStatus(s),
                    })),
                  ],
                },
                {
                  id: "industry",
                  label: t("filterIndustryLabel"),
                  value: industryFilter,
                  onValueChange: setIndustryFilter,
                  options: [
                    { value: "all", label: t("filterIndustryAll") },
                    ...(industriesQuery.data ?? []).map((ind) => ({
                      value: ind.id,
                      label: ind.displayName,
                    })),
                  ],
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
              ]}
            />
          }
          actions={
            <Button onClick={panel.openCreate}>
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              {t("newProject")}
            </Button>
          }
        />

        <TableDetailLayout
          open={panel.isOpen}
          onClose={panel.close}
          panelClassName="sm:max-w-xl"
          panel={
            <>
              <PanelHeaderBar
                onCollapse={panel.close}
                collapseLabel={t("collapsePanel")}
                fullPageHref={
                  !isCreateMode && projectParam ? `/projects/${projectParam}` : undefined
                }
                fullPageLabel={t("openFullPage")}
              />
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <SheetTitle className="sr-only">
                  {isCreateMode ? t("newProject") : (projectInitial?.title ?? "")}
                </SheetTitle>
                {isCreateMode && (
                  <ProjectForm
                    key="new"
                    mode="create"
                    onClose={panel.close}
                    containment="container"
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
              labels={{
                columns: tTable("columns"),
                reset: tTable("reset"),
                rowActions: tTable("rowActions"),
                openPanel: tTable("openPanel"),
                errorTitle: tTable("loadError"),
                retry: tTable("retry"),
              }}
              selectedRowId={projectParam}
              isLoading={query.isLoading}
              isError={query.isError}
              onRetry={() => query.refetch()}
              emptyState={isFiltered ? t("emptyFiltered") : t("empty")}
              primaryColumn={{
                header: t("columns.title"),
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
                href: (p) => (p.deletedAt ? undefined : `/projects?project=${p.id}`),
                enableSorting: true,
                sortAccessor: (p) => p.title,
                edit: {
                  getValue: (p) => p.title,
                  maxLength: 120,
                  onSave: (p, value) => updateMutation.mutate({ id: p.id, title: value }),
                },
              }}
              columns={[
                {
                  id: "status",
                  header: t("columns.status"),
                  cell: (p) => (
                    <Badge variant={STATUS_BADGE_VARIANT[p.publicStatus]} size="sm">
                      {tStatus(p.publicStatus)}
                    </Badge>
                  ),
                  enableSorting: true,
                  sortAccessor: (p) => tStatus(p.publicStatus),
                },
                {
                  id: "industries",
                  header: t("columns.industries"),
                  cell: (p) =>
                    p.industries.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {p.industries.slice(0, 3).map((ind) => (
                          <Badge key={ind.id} variant="secondary" size="sm">
                            {ind.displayName}
                          </Badge>
                        ))}
                        {p.industries.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{p.industries.length - 3}
                          </span>
                        )}
                      </div>
                    ),
                },
                {
                  id: "updated",
                  header: t("columns.updated"),
                  cell: (p) => (
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(p.updatedAt)}
                    </span>
                  ),
                  enableSorting: true,
                  sortAccessor: (p) => new Date(p.updatedAt),
                },
              ]}
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
