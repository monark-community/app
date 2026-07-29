"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BulkEditBar,
  ConfirmDialog,
  DataTable,
  FilterBar,
  FilterBarSearch,
  PanelHeader,
  TableDetailLayout,
  TableEmptyState,
  TableTools,
  clearAllFilters,
  tableEmptyReason,
  useDataTableLayout,
  useDetailPanelRoute,
  usePaginatedList,
  type BulkEditLabels,
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
import { TITLE_FIELD_KEY } from "@monark/data-models/contracts";
import { trpc } from "@/lib/trpc";
import { usePaginationLabels } from "@/lib/use-pagination-labels";
import { useTableEmptyLabels } from "@/lib/use-table-empty-labels";
import { RecordAccessSection } from "./record-access-section";
import { ModelWatchButton, RecordWatchButton } from "./watch-buttons";

interface ModelInfo {
  id: string;
  key: string;
  name: string;
  organizationId: string | null;
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
  data: Record<string, unknown>;
  deletedAt: string | null;
  updatedAt: string;
}

/** The server filter type a field's values are stored + compared as (for the
 *  list filter menu), or `null` when the field isn't filterable yet. RELATION
 *  is skipped — it needs an async id→label picker the `FilterConfig` union
 *  doesn't model. FORMULA follows its inferred result type. */
type RecordFilterType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "selectAny"
  | "multiSelect";
/** A non-neutral field filter as sent to `records.list`. */
type QueryFieldFilter = { key: string; type: RecordFilterType; value: string | string[] };
function filterTypeForField(def: FieldDef): RecordFilterType | null {
  switch (def.type) {
    // Single-select filters by any of one-or-more chosen values (a scalar
    // stored value matched with OR-equals server-side), so a status can be
    // narrowed to e.g. "Open" or "In progress".
    case "singleSelect":
      return "selectAny";
    case "multiSelect":
      return "multiSelect";
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "date":
    case "datetime":
      return "date";
    case "text":
    case "longText":
    case "richText":
    case "url":
    case "email":
      return "text";
    case "formula":
      return def.resultType;
    case "relation":
      return null;
    case "file":
      // Not filterable in v1 (a file value is an opaque id) — mirrors relation.
      return null;
  }
}

// Neutral sentinel for single-value (select / boolean) field filters — "no
// constraint". Chosen not to collide with a real option value.
const FILTER_ANY = "__any__";

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
  // Per-field filter values, keyed by field key. A `string` for single-value
  // filters (text / number / date / select / boolean), a `string[]` for
  // multi-select. Neutral entries are pruned before hitting the query.
  const [fieldFilters, setFieldFilters] = useState<Record<string, string | string[]>>({});
  const setFieldFilter = (key: string, value: string | string[]) =>
    setFieldFilters((prev) => ({ ...prev, [key]: value }));

  // Bulk edit is gated by a permission separate from single-record editing :
  // the caller needs record-write on this model AND the org-level
  // record-bulk-write capability (the server enforces the same). Hide the
  // whole selection affordance when they can't, so it never dead-ends.
  const permsQuery = trpc.rbac.myPermissions.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
  const perms = permsQuery.data ?? [];
  const canWrite =
    perms.includes("data-models.record-write") ||
    perms.includes(`data-models.${model.key}-record-write`);
  const canBulkEdit = canWrite && perms.includes("data-models.record-bulk-write");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  // Shared file source for every FILE / ATTACHMENTS field on the page : hydrate
  // chips (name / size) via `files.byIds` and resolve a download URL on click.
  const fileSource = {
    loadByIds: (ids: string[]) =>
      utils.files.byIds
        .fetch({ ids })
        .then((rows) =>
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            size: r.size,
            contentType: r.contentType,
          })),
        )
        .catch(() => []),
    getDownloadUrl: (id: string) =>
      utils.files.downloadUrl
        .fetch({ fileId: id })
        .then((r) => r.url)
        .catch(() => ""),
  };

  const fieldDefs: FieldDef[] = activeFields.map((f) =>
    dataFieldToFieldDef(f, { relationSource: makeRelationSource, fileSource }),
  );

  // The non-neutral field filters, ready for the query. `flatMap` drops fields
  // that aren't filterable (relation) or whose value is empty / "any".
  const activeFieldFilters = activeFields.flatMap((field, i): QueryFieldFilter[] => {
    const def = fieldDefs[i];
    if (!def) return [];
    const type = filterTypeForField(def);
    if (!type) return [];
    const raw = fieldFilters[field.key];
    if (type === "multiSelect" || type === "selectAny") {
      const arr = Array.isArray(raw) ? raw : [];
      return arr.length > 0 ? [{ key: field.key, type, value: arr }] : [];
    }
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value === "" || value === FILTER_ANY) return [];
    return [{ key: field.key, type, value }];
  });

  const paginationLabels = usePaginationLabels();
  const pagination = usePaginatedList({
    resetKey: [search, showArchived, JSON.stringify(fieldFilters)],
  });

  const query = trpc.dataModels.records.list.useQuery(
    {
      dataModelId: model.id,
      search: search.length > 0 ? search : undefined,
      includeDeleted: showArchived,
      fieldFilters: activeFieldFilters.length > 0 ? activeFieldFilters : undefined,
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
  const bulkUpdateMutation = trpc.dataModels.records.bulkUpdate.useMutation({
    onSuccess: (res) => {
      toast.success(t("bulkEdit.success", { count: res.count }));
      utils.dataModels.records.list.invalidate({ dataModelId: model.id });
    },
    onError: (err) => toast.error(t("bulkEdit.error") + ` (${err.message})`),
  });

  const rows: RawRecord[] = query.data?.items ?? [];
  const hasActiveFilters = activeFieldFilters.length > 0 || showArchived;
  const emptyLabels = useTableEmptyLabels({ query: search, noData: t("empty") });

  // Keep selection scoped to currently-visible rows : prune ids that fall out
  // of the page (filter / search / page change / refetch), so a bulk edit only
  // ever touches rows the user can actually see selected.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(rows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const layout = useDataTableLayout(`data-records-${model.key}-table`);

  // One filter per active field (the value picker matches the field's type),
  // so the filter menu lists every field and each opens a value sub-menu.
  const fieldFilterConfigs: FilterConfig[] = activeFields.flatMap((field, i): FilterConfig[] => {
    const def = fieldDefs[i];
    if (!def) return [];
    const type = filterTypeForField(def);
    if (!type) return []; // relation — not filterable yet
    const raw = fieldFilters[field.key];
    const label = field.label;

    // Both single- and multi-select filter by any of one-or-more chosen
    // values, so both render a checklist. (`selectAny` matches the scalar
    // single-select value ; `multiSelect` matches the stored array.)
    if (type === "multiSelect" || type === "selectAny") {
      // Mirror the table/form rendering : when the field shows its values as
      // colored badges, the filter options carry the same badge so a status'
      // color is a visual reminder in the menu. `searchText` keeps the plain
      // label matchable by the option typeahead (the label is now a node).
      const options =
        def.type === "singleSelect" || def.type === "multiSelect"
          ? def.options.map((o) => ({
              value: o.value,
              label: def.badges ? (
                <Badge variant={o.tone ?? "secondary"} size="sm">
                  {o.label}
                </Badge>
              ) : (
                o.label
              ),
              searchText: o.label,
            }))
          : [];
      return [
        {
          id: field.key,
          type: "multiSelect" as const,
          label,
          value: Array.isArray(raw) ? raw : [],
          options,
          onValueChange: (v: string[]) => setFieldFilter(field.key, v),
        },
      ];
    }
    if (type === "boolean") {
      return [
        {
          id: field.key,
          label,
          value: typeof raw === "string" ? raw : FILTER_ANY,
          defaultValue: FILTER_ANY,
          options: [
            { value: FILTER_ANY, label: t("filterAny") },
            { value: "true", label: t("filterYes") },
            { value: "false", label: t("filterNo") },
          ],
          onValueChange: (v: string) => setFieldFilter(field.key, v),
        },
      ];
    }
    if (type === "date") {
      return [
        {
          id: field.key,
          type: "date" as const,
          label,
          value: typeof raw === "string" ? raw : "",
          onValueChange: (v: string) => setFieldFilter(field.key, v),
        },
      ];
    }
    // text | number → a text input (number does an exact match server-side).
    return [
      {
        id: field.key,
        type: "text" as const,
        label,
        value: typeof raw === "string" ? raw : "",
        placeholder: type === "number" ? t("filterNumberPlaceholder") : undefined,
        onValueChange: (v: string) => setFieldFilter(field.key, v),
      },
    ];
  });

  const filterConfigs: FilterConfig[] = [
    ...fieldFilterConfigs,
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
      // The reserved title field is already shown as the pinned primary
      // column, so it never becomes a data column.
      if (field.key === TITLE_FIELD_KEY) return null;
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

  const bulkLabels: BulkEditLabels = {
    selectedCount: (count) => t("bulkEdit.selected", { count }),
    edit: t("bulkEdit.edit"),
    clear: t("bulkEdit.clear"),
    dialogTitle: t("bulkEdit.dialogTitle"),
    fieldLabel: t("bulkEdit.fieldLabel"),
    fieldPlaceholder: t("bulkEdit.fieldPlaceholder"),
    apply: (count) => t("bulkEdit.apply", { count }),
    cancel: t("bulkEdit.cancel"),
    differsWarning: t("bulkEdit.differsWarning"),
  };

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
            include={["filters", "sorting"]}
          />
        }
        actions={
          <div className="flex items-center gap-2">
            <ModelWatchButton modelId={model.id} />
            <TableTools
              layout={layout}
              primaryColumn={primaryColumn}
              columns={columns}
              labels={toolsLabels}
              include={["columns"]}
            />
            <Button onClick={panel.openCreate}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              {t("createCta", { model: model.name })}
            </Button>
          </div>
        }
      />

      {canBulkEdit && (
        <BulkEditBar
          count={selectedIds.size}
          fields={fieldDefs}
          selectedValues={(fieldName) =>
            rows.filter((r) => selectedIds.has(r.id)).map((r) => r.data[fieldName])
          }
          onApply={async (fieldName, value) => {
            await bulkUpdateMutation.mutateAsync({
              ids: [...selectedIds],
              data: { [fieldName]: value },
            });
          }}
          onClear={() => setSelectedIds(new Set())}
          isApplying={bulkUpdateMutation.isPending}
          labels={bulkLabels}
        />
      )}

      <TableDetailLayout
        open={panel.isOpen}
        onClose={panel.close}
        storageKey={`data-records-${model.key}`}
        panelClassName="sm:max-w-xl"
        tableClassName="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col"
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
                <>
                  <div className="mb-4 flex justify-end">
                    <RecordWatchButton recordId={recordParam} />
                  </div>
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
                  {model.organizationId && (
                    <RecordAccessSection
                      recordId={recordParam}
                      organizationId={model.organizationId}
                    />
                  )}
                </>
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
              selectRow: tTable("selectRow"),
              selectAll: tTable("selectAll"),
              errorTitle: tTable("loadError"),
              retry: tTable("retry"),
            }}
            selection={
              canBulkEdit ? { selectedIds, onSelectedIdsChange: setSelectedIds } : undefined
            }
            selectedRowId={recordParam}
            isLoading={query.isLoading}
            isError={query.isError}
            onRetry={() => query.refetch()}
            emptyState={
              <TableEmptyState
                reason={tableEmptyReason({
                  hasSearch: search.length > 0,
                  hasFilters: hasActiveFilters,
                })}
                labels={emptyLabels}
                onClearSearch={() => setRawSearch("")}
                onClearFilters={() => clearAllFilters(filterConfigs)}
                createAction={
                  canWrite
                    ? { label: t("createCta", { model: model.name }), onClick: panel.openCreate }
                    : undefined
                }
              />
            }
            pagination={pagination.getFooterProps(query.data, paginationLabels)}
            fillParent
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
