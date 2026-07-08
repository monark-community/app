"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
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
  useDataTableLayout,
  useDetailPanelRoute,
  usePaginatedList,
  type DataColumnDef,
  type FilterConfig,
  type PrimaryColumnDef,
  type TableToolsLabels,
} from "@/components/patterns";
import {
  AutoForm,
  dataFieldToFieldDef,
  fieldColumn,
  recordDataToDefaultValues,
  useDebounced,
  useFieldStrings,
  type DataFieldForAdapter,
  type FieldDef,
  type RelationSource,
} from "@/components/fields";
import { trpc } from "@/lib/trpc";
import { usePaginationLabels } from "@/lib/use-pagination-labels";

interface ModelInfo {
  id: string;
  key: string;
  name: string;
  organizationId: string | null;
  /** The field whose value backs `record.title` (shown as the primary column),
   * or null when unset. That field is omitted from the data columns so it
   * isn't rendered twice. */
  titleFieldId: string | null;
}

// Hand-written rather than derived from the query's inferred type — see
// ModelEditor's `FieldRow` for why (a generic extraction over a tRPC hook's
// return blows up TS's instantiation depth on this large a merged router).
interface RawField {
  id: string;
  key: string;
  label: string;
  description: string | null;
  type: DataFieldForAdapter["type"];
  config: unknown;
  required: boolean;
  archivedAt: string | null;
}

interface RawRecord {
  id: string;
  title: string;
  slug: string | null;
  data: Record<string, unknown>;
  deletedAt: string | null;
  updatedAt: string;
}

export function RecordsList({ model }: { model: ModelInfo }) {
  const t = useTranslations("data.records");
  const tTable = useTranslations("table");
  const tFilters = useTranslations("filters");
  const { labels: fieldChromeLabels } = useFieldStrings();
  const utils = trpc.useUtils();

  const panel = useDetailPanelRoute(`/data/models/${model.key}`, "record");
  const recordParam = panel.selectedId;
  const isCreateMode = panel.isCreate;

  const [showArchived, setShowArchived] = useState(false);
  const [confirmMode, setConfirmMode] = useState<{ type: "delete"; id: string } | null>(null);
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch.trim(), 250);

  const fieldsQuery = trpc.dataModels.fields.list.useQuery({ dataModelId: model.id });
  const rawFields: RawField[] = fieldsQuery.data ?? [];
  const activeFields = rawFields.filter((f) => !f.archivedAt);

  // Resolves a RELATION field's target Data Model by key, in the caller's
  // active org (mirrors resolve-model.ts's server-side twin).
  async function resolveTargetModelId(targetKey: string): Promise<string | null> {
    const model = await utils.dataModels.models.getByKey
      .fetch({ key: targetKey })
      .catch(() => null);
    return model?.id ?? null;
  }

  function makeRelationSource(config: {
    relationTarget: string;
    relationTargetKind: "DATA_MODEL" | "SYSTEM_MODEL";
  }): RelationSource {
    if (config.relationTargetKind !== "DATA_MODEL") {
      // System-model relation targets (e.g. "Calendar") aren't generically
      // wired yet — known v1 gap, documented in the data-models README.
      return {
        model: config.relationTarget,
        loadOptions: async () => [],
        loadByIds: async () => [],
      };
    }
    return {
      model: config.relationTarget,
      loadOptions: async (query) => {
        const targetId = await resolveTargetModelId(config.relationTarget);
        if (!targetId) return [];
        const page = await utils.dataModels.records.list.fetch({
          dataModelId: targetId,
          search: query || undefined,
          limit: 20,
        });
        return page.items.map((r) => ({ id: r.id, label: r.title }));
      },
      loadByIds: async (ids) => {
        const results = await Promise.all(
          ids.map((id) => utils.dataModels.records.getById.fetch({ id }).catch(() => null)),
        );
        return results
          .filter((r): r is NonNullable<typeof r> => r != null)
          .map((r) => ({ id: r.id, label: r.title }));
      },
    };
  }

  const fieldDefs: FieldDef[] = activeFields.map((f) =>
    dataFieldToFieldDef(f, { relationSource: makeRelationSource }),
  );

  const paginationLabels = usePaginationLabels();
  const pagination = usePaginatedList({ resetKey: [search, showArchived] });

  const query = trpc.dataModels.records.list.useQuery(
    {
      dataModelId: model.id,
      search: search.length > 0 ? search : undefined,
      includeDeleted: showArchived,
      limit: pagination.limit,
      cursor: pagination.cursor,
    },
    { refetchOnWindowFocus: false, placeholderData: keepPreviousData },
  );

  const recordQuery = trpc.dataModels.records.getById.useQuery(
    { id: recordParam! },
    { enabled: !isCreateMode && !!recordParam },
  );

  const createMutation = trpc.dataModels.records.create.useMutation({
    onSuccess: () => {
      toast.success(t("createSuccess"));
      utils.dataModels.records.list.invalidate({ dataModelId: model.id });
      panel.close();
    },
    onError: (err) => toast.error(t("createError") + ` (${err.message})`),
  });
  const updateMutation = trpc.dataModels.records.update.useMutation({
    onSuccess: () => {
      toast.success(t("updateSuccess"));
      utils.dataModels.records.list.invalidate({ dataModelId: model.id });
      if (recordParam) utils.dataModels.records.getById.invalidate({ id: recordParam });
    },
    onError: (err) => toast.error(t("updateError") + ` (${err.message})`),
  });
  const deleteMutation = trpc.dataModels.records.delete.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(t("delete.success"));
      utils.dataModels.records.list.invalidate({ dataModelId: model.id });
      if (variables.id === recordParam) panel.close();
      setConfirmMode(null);
    },
    onError: (err) => toast.error(t("delete.error") + ` (${err.message})`),
  });
  const restoreMutation = trpc.dataModels.records.restore.useMutation({
    onSuccess: () => {
      toast.success(t("restore.success"));
      utils.dataModels.records.list.invalidate({ dataModelId: model.id });
    },
    onError: (err) => toast.error(t("restore.error") + ` (${err.message})`),
  });

  const rows: RawRecord[] = query.data?.items ?? [];
  const isFiltered = search.length > 0;

  const layout = useDataTableLayout(`data-records-${model.key}-table`);

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

  const primaryColumn: PrimaryColumnDef<RawRecord> = {
    header: model.name,
    label: (r) => r.title || t("untitled"),
    subtext: (r) => r.slug ?? undefined,
    href: (r) => `/data/models/${model.key}?record=${r.id}`,
    enableSorting: true,
  };

  // One column per active field, EXCEPT the title-backing field — its value is
  // already the primary column's label (and sortable there), so a separate
  // column would just repeat it. RELATION columns render a plain count badge
  // rather than resolving labels — resolving every visible row's relation
  // targets would mean an extra fetch per row per page ; the detail form
  // (AutoForm) still fully resolves relation chips for the one record that's
  // actually open, via `loadByIds`.
  const columns: DataColumnDef<RawRecord>[] = activeFields
    .map((field, index) => {
      if (field.id === model.titleFieldId) return null;
      const def = fieldDefs[index];
      if (!def) throw new Error(`missing FieldDef for field ${field.key}`);
      if (def.type === "relation") {
        return {
          id: field.key,
          header: field.label,
          cell: (r) => {
            const value = r.data[field.key];
            const count = Array.isArray(value) ? value.length : value ? 1 : 0;
            return count > 0 ? (
              <Badge variant="outline">{count}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            );
          },
        } satisfies DataColumnDef<RawRecord>;
      }
      return fieldColumn<RawRecord>(def, {
        accessor: (r) => r.data[field.key],
        labels: fieldChromeLabels,
      });
    })
    .filter((c): c is DataColumnDef<RawRecord> => c !== null);

  const recordInitial = recordQuery.data
    ? recordDataToDefaultValues(activeFields, recordQuery.data.data)
    : undefined;

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
            {t("createCta", { model: model.name })}
          </Button>
        }
      />

      <TableDetailLayout
        open={panel.isOpen}
        onClose={panel.close}
        storageKey={`data-records-${model.key}`}
        panelClassName="sm:max-w-xl"
        panel={
          <>
            <SheetTitle className="sr-only">
              {isCreateMode
                ? t("panelCreateTitle", { model: model.name })
                : recordQuery.data?.title}
            </SheetTitle>
            <PanelHeader
              title={
                isCreateMode
                  ? t("panelCreateTitle", { model: model.name })
                  : (recordQuery.data?.title ?? "")
              }
              onClose={panel.close}
              fullPageHref={recordParam ? `/data/models/${model.key}/${recordParam}` : undefined}
              fullPageLabel={t("openFullPage")}
            />
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {isCreateMode && (
                <AutoForm
                  fields={fieldDefs}
                  onSubmit={async (values) => {
                    await createMutation.mutateAsync({ dataModelId: model.id, data: values });
                  }}
                  onCancel={panel.close}
                  submitLabel={t("submit")}
                  cancelLabel={t("cancel")}
                  isBusy={createMutation.isPending}
                />
              )}
              {!isCreateMode && recordParam && recordQuery.isLoading && (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              )}
              {!isCreateMode && recordParam && !recordQuery.isLoading && !recordQuery.data && (
                <p className="text-sm text-muted-foreground">{t("notFound")}</p>
              )}
              {!isCreateMode && recordParam && recordQuery.data && (
                <AutoForm
                  key={recordParam}
                  fields={fieldDefs}
                  defaultValues={recordInitial}
                  onSubmit={async (values) => {
                    await updateMutation.mutateAsync({ id: recordParam, data: values });
                  }}
                  onCancel={panel.close}
                  submitLabel={t("submit")}
                  cancelLabel={t("cancel")}
                  isBusy={updateMutation.isPending}
                  deleteConfig={{
                    deleteLabel: t("actions.delete"),
                    title: t("delete.title"),
                    description: t("delete.description"),
                    cancelLabel: t("delete.cancel"),
                    confirmLabel: t("delete.confirm"),
                    isPending: deleteMutation.isPending,
                    onDelete: () => setConfirmMode({ type: "delete", id: recordParam }),
                  }}
                />
              )}
            </div>
          </>
        }
        table={
          <DataTable
            data={rows}
            getRowId={(r) => r.id}
            primaryColumn={primaryColumn}
            columns={columns}
            rowActions={(r) => [
              r.deletedAt
                ? {
                    label: t("actions.restore"),
                    icon: RotateCcw,
                    onSelect: () => restoreMutation.mutate({ id: r.id }),
                  }
                : {
                    label: t("actions.delete"),
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setConfirmMode({ type: "delete", id: r.id }),
                  },
            ]}
            storageKey={`data-records-${model.key}-table`}
            layout={layout}
            labels={{
              rowActions: tTable("rowActions"),
              errorTitle: tTable("loadError"),
              retry: tTable("retry"),
            }}
            selectedRowId={recordParam}
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
        description={t("delete.description")}
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
