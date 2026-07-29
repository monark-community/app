"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
import { SheetTitle } from "@/components/ui/sheet";
import { OrganizationLogo } from "@/components/organization-logo";
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite";
import { trpc } from "@/lib/trpc";
import { useTableEmptyLabels } from "@/lib/use-table-empty-labels";
import { OrganizationDetail } from "./[id]/organization-detail";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function OrganizationsList() {
  const t = useTranslations("admin.organizations");
  const tTable = useTranslations("table");
  const tFilters = useTranslations("filters");
  const panel = useDetailPanelRoute("/admin/organizations", "organization");
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch.trim(), 250);
  const [limit, setLimit] = useState(25);
  const emptyLabels = useTableEmptyLabels({ query: search, noData: t("empty") });

  useEffect(() => {
    setLimit(25);
  }, [search]);

  const query = trpc.organizations.adminList.useQuery(
    { search: search || undefined, limit },
    { refetchOnWindowFocus: false, placeholderData: keepPreviousData },
  );

  const items = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const hasMore = Boolean(query.data?.nextCursor);
  const canLoadMore = hasMore && limit < 100;

  type OrgRow = (typeof items)[number];

  const layout = useDataTableLayout("admin-organizations-table");

  const primaryColumn: PrimaryColumnDef<OrgRow> = {
    header: t("columns.name"),
    leading: (org) => (
      <OrganizationLogo
        logoUrl={org.logoUrl ? rewriteForCurrentHost(org.logoUrl) : null}
        size="sm"
      />
    ),
    label: (org) => org.displayName,
    href: (org) => `/admin/organizations?organization=${org.id}`,
    enableSorting: true,
    sortAccessor: (org) => org.displayName,
  };

  const orgColumns: DataColumnDef<OrgRow>[] = [
    {
      id: "color",
      header: t("columns.color"),
      align: "right",
      // Swatch always renders ; null primaryColor falls back to
      // white so a fresh org still shows a (bordered) dot.
      cell: (org) => (
        <span className="ml-auto flex justify-end">
          <span
            aria-hidden
            className="h-4 w-4 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: org.primaryColor ?? "#FFFFFF" }}
          />
        </span>
      ),
      size: 96,
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
  };

  return (
    <div className="space-y-3">
      <FilterBar
        search={
          <FilterBarSearch
            value={rawSearch}
            onChange={setRawSearch}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
          />
        }
        tools={
          <TableTools
            layout={layout}
            primaryColumn={primaryColumn}
            columns={orgColumns}
            labels={toolsLabels}
            include={["filters", "sorting"]}
          />
        }
        actions={
          <TableTools
            layout={layout}
            primaryColumn={primaryColumn}
            columns={orgColumns}
            labels={toolsLabels}
            include={["columns"]}
          />
        }
      />

      <TableDetailLayout
        open={panel.isOpen}
        onClose={panel.close}
        storageKey="admin-organizations"
        panelClassName="sm:max-w-xl"
        panel={
          <>
            <SheetTitle className="sr-only">{t("panelTitle")}</SheetTitle>
            <PanelHeader
              title={t("panelTitle")}
              onClose={panel.close}
              fullPageHref={
                panel.selectedId ? `/admin/organizations/${panel.selectedId}` : undefined
              }
              fullPageLabel={t("openFullPage")}
            />
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {panel.selectedId && (
                <OrganizationDetail
                  key={panel.selectedId}
                  orgId={panel.selectedId}
                  containment="container"
                />
              )}
            </div>
          </>
        }
        table={
          <DataTable
            data={items}
            getRowId={(o) => o.id}
            storageKey="admin-organizations-table"
            layout={layout}
            labels={{
              rowActions: tTable("rowActions"),
              errorTitle: tTable("loadError"),
              retry: tTable("retry"),
            }}
            selectedRowId={panel.selectedId}
            isLoading={query.isLoading}
            isError={query.isError}
            onRetry={() => query.refetch()}
            emptyState={
              <TableEmptyState
                reason={tableEmptyReason({ hasSearch: search.length > 0, hasFilters: false })}
                labels={emptyLabels}
                onClearSearch={() => setRawSearch("")}
              />
            }
            primaryColumn={primaryColumn}
            columns={orgColumns}
          />
        }
      />

      {canLoadMore && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLimit((current) => Math.min(current + 25, 100))}
            disabled={query.isFetching}
          >
            {query.isFetching ? t("loading") : t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
