"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { Power, PowerOff, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  ConfirmDialog,
  DataTable,
  FilterBar,
  FilterBarSearch,
  TableEmptyState,
  TableTools,
  tableEmptyReason,
  useDataTableLayout,
  usePaginatedList,
  type DataColumnDef,
  type PrimaryColumnDef,
  type TableToolsLabels,
} from "@/components/patterns";
import { useDebounced } from "@/components/fields";
import { formatRelativeTime } from "@/lib/format-time";
import { trpc } from "@/lib/trpc";
import { usePaginationLabels } from "@/lib/use-pagination-labels";
import { useTableEmptyLabels } from "@/lib/use-table-empty-labels";

export function AutomationsList({
  canCreate,
  canManage,
}: {
  canCreate: boolean;
  canManage: boolean;
}) {
  const t = useTranslations("automation.list");
  const tTable = useTranslations("table");
  const locale = useLocale();
  const router = useRouter();
  const utils = trpc.useUtils();

  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch.trim(), 250);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  const paginationLabels = usePaginationLabels();
  const pagination = usePaginatedList({ resetKey: [search] });
  const layout = useDataTableLayout("automation-automations-table");

  const toolsLabels: TableToolsLabels = {
    tools: tTable("tools"),
    close: tTable("close"),
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
  };

  const query = trpc.automation.automations.list.useQuery(
    {
      search: search.length > 0 ? search : undefined,
      limit: pagination.limit,
      cursor: pagination.cursor,
    },
    { refetchOnWindowFocus: false, placeholderData: keepPreviousData },
  );

  // Resolve the raw trigger event type (e.g. `kanban.card-created`) to its human
  // description (e.g. "Card created") for the Trigger column.
  const eventTypesQuery = trpc.automation.eventTypes.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
  const eventTypeLabels = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of eventTypesQuery.data?.groups ?? []) {
      for (const e of g.events) m.set(e.type, e.description);
    }
    return m;
  }, [eventTypesQuery.data]);

  const setEnabled = trpc.automation.automations.setEnabled.useMutation({
    onSuccess: () => utils.automation.automations.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.automation.automations.delete.useMutation({
    onSuccess: () => {
      toast.success(t("delete.success"));
      utils.automation.automations.list.invalidate();
      setConfirmDelete(null);
    },
    onError: (err) => toast.error(t("delete.error") + ` (${err.message})`),
  });

  const rows = query.data?.items ?? [];
  type Row = (typeof rows)[number];
  const emptyLabels = useTableEmptyLabels({ query: search, noData: t("empty") });

  const primaryColumn: PrimaryColumnDef<Row> = {
    header: t("columns.name"),
    headerIcon: Workflow,
    label: (a) => a.name,
    href: (a) => `/automation/${a.id}`,
    enableSorting: true,
    sortAccessor: (a) => a.name,
  };

  const columns: DataColumnDef<Row>[] = [
    {
      id: "trigger",
      header: t("columns.trigger"),
      cell: (a) => (
        <span className="text-muted-foreground" title={a.triggerEventType}>
          {eventTypeLabels.get(a.triggerEventType) ?? a.triggerEventType}
        </span>
      ),
      enableSorting: true,
      sortAccessor: (a) => eventTypeLabels.get(a.triggerEventType) ?? a.triggerEventType,
    },
    {
      id: "enabled",
      header: t("columns.enabled"),
      enableSorting: true,
      sortAccessor: (a) => (a.enabled ? 1 : 0),
      cell: (a) =>
        a.enabled ? (
          <Badge variant="outline" size="sm" className="border-emerald-500/40 text-emerald-600">
            {t("statusOn")}
          </Badge>
        ) : (
          <Badge variant="outline" size="sm" className="text-muted-foreground">
            {t("statusOff")}
          </Badge>
        ),
    },
    {
      id: "updated",
      header: t("columns.updated"),
      enableSorting: true,
      sortAccessor: (a) => a.updatedAt as unknown as string,
      cell: (a) => (
        <span className="text-muted-foreground">
          {formatRelativeTime(a.updatedAt as unknown as string, locale)}
        </span>
      ),
      align: "right",
    },
  ];

  return (
    <>
      <div className="space-y-4">
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
              labels={toolsLabels}
              include={["sorting"]}
            />
          }
          actions={
            <div className="flex items-center gap-2">
              <TableTools
                layout={layout}
                primaryColumn={primaryColumn}
                columns={columns}
                labels={toolsLabels}
                include={["columns"]}
              />
              {canCreate && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Workflow className="mr-1.5 h-4 w-4" aria-hidden />
                  {t("createCta")}
                </Button>
              )}
            </div>
          }
        />

        <DataTable
          data={rows}
          getRowId={(a) => a.id}
          storageKey="automation-automations-table"
          layout={layout}
          primaryColumn={primaryColumn}
          columns={columns}
          rowActions={
            canManage
              ? (a) => [
                  {
                    label: a.enabled ? t("actions.disable") : t("actions.enable"),
                    icon: a.enabled ? PowerOff : Power,
                    onSelect: () => setEnabled.mutate({ id: a.id, enabled: !a.enabled }),
                  },
                  {
                    label: t("actions.delete"),
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setConfirmDelete({ id: a.id, name: a.name }),
                  },
                ]
              : undefined
          }
          labels={{
            rowActions: tTable("rowActions"),
            errorTitle: tTable("loadError"),
            retry: tTable("retry"),
          }}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          emptyState={
            <TableEmptyState
              reason={tableEmptyReason({ hasSearch: search.length > 0, hasFilters: false })}
              labels={emptyLabels}
              onClearSearch={() => setRawSearch("")}
              createAction={
                canCreate
                  ? { label: t("createCta"), onClick: () => setCreateOpen(true) }
                  : undefined
              }
            />
          }
          pagination={pagination.getFooterProps(query.data, paginationLabels)}
        />
      </div>

      <CreateAutomationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          utils.automation.automations.list.invalidate();
          router.push(`/automation/${id}`);
        }}
      />

      <ConfirmDialog
        open={confirmDelete != null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={t("delete.title")}
        description={confirmDelete ? t("delete.description", { name: confirmDelete.name }) : ""}
        cancelLabel={t("delete.cancel")}
        confirmLabel={t("delete.confirm")}
        onConfirm={() => confirmDelete && deleteMutation.mutate({ id: confirmDelete.id })}
        isPending={deleteMutation.isPending}
      />
    </>
  );
}

function CreateAutomationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("automation.list.create");
  const [name, setName] = useState("");

  const create = trpc.automation.automations.create.useMutation({
    onSuccess: (row) => {
      toast.success(t("success"));
      onOpenChange(false);
      setName("");
      onCreated(row.id);
    },
    onError: (err) => toast.error(t("error") + ` (${err.message})`),
  });

  const canSubmit = name.trim().length > 0 && !create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="automation-name">{t("nameLabel")}</Label>
            <Input
              id="automation-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              maxLength={120}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={() => create.mutate({ name: name.trim() })}>
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
