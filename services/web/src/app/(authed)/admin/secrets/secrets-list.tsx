"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetTitle } from "@/components/ui/sheet";
import {
  DataTable,
  FilterBar,
  FilterBarSearch,
  PanelHeader,
  TableDetailLayout,
  TableEmptyState,
  TableTools,
  tableEmptyReason,
  useDataTableLayout,
  useDetailPanelRoute,
  type DataColumnDef,
  type PrimaryColumnDef,
  type TableToolsLabels,
} from "@/components/patterns";
import { useDebounced } from "@/components/fields";
import { formatRelativeTime } from "@/lib/format-time";
import { trpc } from "@/lib/trpc";
import { useTableEmptyLabels } from "@/lib/use-table-empty-labels";
import { SecretForm } from "./secret-form";

export function SecretsList() {
  const t = useTranslations("admin.secrets.list");
  const tTable = useTranslations("table");
  const tFilters = useTranslations("filters");
  const locale = useLocale();

  const panel = useDetailPanelRoute("/admin/secrets", "secret");

  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch.trim(), 200);

  // The org's secrets are env-var scale, so the router returns them all at once
  // (no pagination); search filters client-side.
  const query = trpc.secrets.adminList.useQuery(undefined, { refetchOnWindowFocus: false });
  const permsQuery = trpc.rbac.myPermissions.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
  const canManage = (permsQuery.data ?? []).includes("secrets.manage");

  const allRows = query.data ?? [];
  const rows = useMemo(() => {
    const q = search.toLowerCase();
    if (q === "") return allRows;
    return allRows.filter(
      (s) => s.key.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q),
    );
  }, [allRows, search]);

  type SecretRow = (typeof allRows)[number];
  const selected = allRows.find((s) => s.id === panel.selectedId);

  const layout = useDataTableLayout("admin-secrets-table");
  const emptyLabels = useTableEmptyLabels({ query: search, noData: t("empty") });

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

  const primaryColumn: PrimaryColumnDef<SecretRow> = {
    header: t("columns.key"),
    headerIcon: Lock,
    leading: () => <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />,
    label: (s) => <span className="font-mono">{s.key}</span>,
    subtext: (s) => s.description ?? undefined,
    onSelect: (s) => panel.open(s.id),
    enableSorting: true,
    sortAccessor: (s) => s.key,
  };

  const columns: DataColumnDef<SecretRow>[] = [
    {
      id: "lastUsed",
      header: t("columns.lastUsed"),
      cell: (s) => (
        <span className="text-muted-foreground">
          {s.lastUsedAt
            ? formatRelativeTime(s.lastUsedAt as unknown as string, locale)
            : t("never")}
        </span>
      ),
      sortAccessor: (s) =>
        s.lastUsedAt ? new Date(s.lastUsedAt as unknown as string).getTime() : 0,
      align: "right",
    },
    {
      id: "updated",
      header: t("columns.updated"),
      cell: (s) => (
        <span className="text-muted-foreground">
          {formatRelativeTime(s.updatedAt as unknown as string, locale)}
        </span>
      ),
      sortAccessor: (s) => new Date(s.updatedAt as unknown as string),
      align: "right",
    },
  ];

  const panelTitle = panel.isCreate
    ? t("panelCreateTitle")
    : t("panelEditTitle", { key: selected?.key ?? "" });

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
            {canManage && (
              <Button onClick={panel.openCreate}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                {t("createCta")}
              </Button>
            )}
          </div>
        }
      />

      <TableDetailLayout
        open={panel.isOpen}
        onClose={panel.close}
        storageKey="admin-secrets"
        panelClassName="sm:max-w-lg"
        panel={
          <>
            <SheetTitle className="sr-only">{panelTitle}</SheetTitle>
            <PanelHeader title={panelTitle} onClose={panel.close} />
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {panel.isCreate ? (
                <SecretForm mode="create" canManage={canManage} onClose={panel.close} />
              ) : selected ? (
                <SecretForm
                  key={selected.id}
                  mode="edit"
                  secret={{ key: selected.key, description: selected.description }}
                  canManage={canManage}
                  onClose={panel.close}
                />
              ) : null}
            </div>
          </>
        }
        table={
          <DataTable
            data={rows}
            getRowId={(s) => s.id}
            selectedRowId={panel.selectedId}
            primaryColumn={primaryColumn}
            columns={columns}
            storageKey="admin-secrets-table"
            layout={layout}
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
                  canManage ? { label: t("createCta"), onClick: panel.openCreate } : undefined
                }
              />
            }
          />
        }
      />
    </>
  );
}
