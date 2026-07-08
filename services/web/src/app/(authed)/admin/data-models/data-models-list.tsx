"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { Database, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetTitle } from "@/components/ui/sheet";
import {
  ConfirmDialog,
  DataTable,
  FilterBar,
  FilterBarSearch,
  PanelHeader,
  TableDetailLayout,
  TableTools,
  useDataTableLayout,
  useDetailPanelRoute,
  usePaginatedList,
  type DataColumnDef,
  type FilterConfig,
  type PrimaryColumnDef,
  type TableToolsLabels,
} from "@/components/patterns";
import { AutoForm, useDebounced, type FieldDef } from "@/components/fields";
import { formatRelativeTime } from "@/lib/format-time";
import { trpc } from "@/lib/trpc";
import { usePaginationLabels } from "@/lib/use-pagination-labels";

type ConfirmMode = null | { type: "delete"; id: string; name: string };

export function DataModelsList() {
  const t = useTranslations("admin.dataModels.list");
  const tCreate = useTranslations("admin.dataModels.create");
  const tTable = useTranslations("table");
  const tFilters = useTranslations("filters");
  const locale = useLocale();
  const utils = trpc.useUtils();
  const router = useRouter();

  const panel = useDetailPanelRoute("/admin/data-models", "model");
  const isCreateMode = panel.isCreate;

  const [showArchived, setShowArchived] = useState(false);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch.trim(), 250);

  const paginationLabels = usePaginationLabels();
  const pagination = usePaginatedList({ resetKey: [search, showArchived] });

  const query = trpc.dataModels.models.list.useQuery(
    {
      search: search.length > 0 ? search : undefined,
      includeDeleted: showArchived,
      limit: pagination.limit,
      cursor: pagination.cursor,
    },
    { refetchOnWindowFocus: false, placeholderData: keepPreviousData },
  );

  const deleteMutation = trpc.dataModels.models.delete.useMutation({
    onSuccess: () => {
      toast.success(t("delete.success"));
      utils.dataModels.models.list.invalidate();
      setConfirmMode(null);
    },
    onError: (err) => toast.error(t("delete.error") + ` (${err.message})`),
  });

  const restoreMutation = trpc.dataModels.models.restore.useMutation({
    onSuccess: () => {
      toast.success(t("restore.success"));
      utils.dataModels.models.list.invalidate();
    },
    onError: (err) => toast.error(t("restore.error") + ` (${err.message})`),
  });

  const createMutation = trpc.dataModels.models.create.useMutation({
    onSuccess: (model) => {
      toast.success(tCreate("success"));
      utils.dataModels.models.list.invalidate();
      panel.close();
      router.push(`/admin/data-models/${model.id}`);
    },
    onError: (err) => toast.error(tCreate("error") + ` (${err.message})`),
  });

  const rows = query.data?.items ?? [];
  const isFiltered = search.length > 0;

  type ModelRow = (typeof rows)[number];

  const layout = useDataTableLayout("admin-data-models-table");

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

  const primaryColumn: PrimaryColumnDef<ModelRow> = {
    header: t("columns.name"),
    headerIcon: Database,
    label: (m) => m.name,
    subtext: (m) =>
      m.deletedAt ? (
        <span className="flex items-center gap-2">
          <span>{m.key}</span>
          <Badge variant="outline" size="sm" className="text-muted-foreground">
            {t("actions.delete")}
          </Badge>
        </span>
      ) : (
        m.key
      ),
    href: (m) => `/admin/data-models/${m.id}`,
    enableSorting: true,
  };

  const columns: DataColumnDef<ModelRow>[] = [
    {
      id: "updated",
      header: t("columns.updated"),
      cell: (m) => (
        <span className="text-muted-foreground">
          {formatRelativeTime(m.updatedAt as unknown as string, locale)}
        </span>
      ),
      sortAccessor: (m) => new Date(m.updatedAt as unknown as string),
      align: "right",
    },
  ];

  const createFields: FieldDef[] = [
    {
      type: "text",
      name: "name",
      label: tCreate("nameLabel"),
      placeholder: tCreate("namePlaceholder"),
      required: true,
      maxLength: 80,
    },
    {
      type: "text",
      name: "key",
      label: tCreate("keyLabel"),
      placeholder: tCreate("keyPlaceholder"),
      description: tCreate("keyHint"),
    },
    {
      type: "longText",
      name: "description",
      label: tCreate("descriptionLabel"),
      placeholder: tCreate("descriptionPlaceholder"),
    },
  ];

  return (
    <>
      <FilterBar
        search={
          <FilterBarSearch
            value={rawSearch}
            onChange={setRawSearch}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAria")}
          />
        }
        tools={
          <TableTools
            layout={layout}
            primaryColumn={primaryColumn}
            columns={columns}
            filters={filterConfigs}
            labels={toolsLabels}
          />
        }
        actions={
          <Button onClick={panel.openCreate}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            {t("createCta")}
          </Button>
        }
      />

      <TableDetailLayout
        open={panel.isOpen}
        onClose={panel.close}
        storageKey="admin-data-models"
        panelClassName="sm:max-w-lg"
        panel={
          <>
            <SheetTitle className="sr-only">{t("panelCreateTitle")}</SheetTitle>
            <PanelHeader title={t("panelCreateTitle")} onClose={panel.close} />
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {isCreateMode && (
                <AutoForm
                  fields={createFields}
                  onSubmit={async (values) => {
                    await createMutation.mutateAsync({
                      key: (values.key as string) || undefined,
                      name: values.name as string,
                      description: (values.description as string) || undefined,
                    });
                  }}
                  onCancel={panel.close}
                  submitLabel={tCreate("submit")}
                  cancelLabel={tCreate("cancel")}
                  isBusy={createMutation.isPending}
                />
              )}
            </div>
          </>
        }
        table={
          <DataTable
            data={rows}
            getRowId={(m) => m.id}
            primaryColumn={primaryColumn}
            columns={columns}
            rowActions={(m) => [
              m.deletedAt
                ? {
                    label: t("actions.restore"),
                    icon: RotateCcw,
                    onSelect: () => restoreMutation.mutate({ id: m.id }),
                  }
                : {
                    label: t("actions.delete"),
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setConfirmMode({ type: "delete", id: m.id, name: m.name }),
                  },
            ]}
            storageKey="admin-data-models-table"
            layout={layout}
            labels={{
              rowActions: tTable("rowActions"),
              errorTitle: tTable("loadError"),
              retry: tTable("retry"),
            }}
            isLoading={query.isLoading}
            isError={query.isError}
            onRetry={() => query.refetch()}
            emptyState={isFiltered ? t("emptySearch", { query: search }) : t("empty")}
            pagination={pagination.getFooterProps(query.data, paginationLabels)}
          />
        }
      />

      <ConfirmDialog
        open={confirmMode?.type === "delete"}
        onOpenChange={(open) => !open && setConfirmMode(null)}
        title={t("delete.title")}
        description={
          confirmMode?.type === "delete" ? t("delete.description", { name: confirmMode.name }) : ""
        }
        cancelLabel={t("delete.cancel")}
        confirmLabel={t("delete.confirm")}
        onConfirm={() =>
          confirmMode?.type === "delete" && deleteMutation.mutate({ id: confirmMode.id })
        }
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
