"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CreateFab,
  DataTable,
  FilterBar,
  FilterBarSearch,
  PanelHeader,
  TableDetailLayout,
  TableEmptyState,
  TableTools,
  activeFilterCount,
  clearAllFilters,
  tableEmptyReason,
  useDataTableLayout,
  useDetailPanelRoute,
  type DataColumnDef,
  type FilterConfig,
  type PrimaryColumnDef,
  type TableToolsLabels,
} from "@/components/patterns";
import { SheetTitle } from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { useTableEmptyLabels } from "@/lib/use-table-empty-labels";
import { WebhookEditor } from "./webhook-editor";

type StatusFilter = "all" | "active" | "disabled" | "failing";

/**
 * Per-org list of webhook endpoints with a URL search + a status badge
 * column. Mirrors the `/admin/rbac` manager pattern : the org picker
 * collapses in single-tenant deploys, the list rows link into the
 * endpoint detail page, and a primary "New endpoint" CTA carries the
 * org id forward. Sysadmins also see a `Platform` slot in the picker
 * that lists endpoints with `organizationId = null` (no org scope).
 */
export function WebhooksManager() {
  const t = useTranslations("admin.webhooks.manager");
  const tFilters = useTranslations("filters");
  const tTable = useTranslations("table");
  const panel = useDetailPanelRoute("/admin/webhooks", "webhook");

  const status = trpc.organizations.bootstrapStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const singletonId = status.data?.singletonOrganizationId ?? null;

  // Endpoints are always listed for the one organization the app serves.
  const [selectedOrgValue, setSelectedOrgValue] = useState("");
  useEffect(() => {
    if (selectedOrgValue !== "") return;
    if (singletonId) setSelectedOrgValue(singletonId);
  }, [singletonId, selectedOrgValue]);

  const selectedOrgId = selectedOrgValue || null;

  const endpointsQuery = trpc.webhooks.list.useQuery(
    { organizationId: selectedOrgId },
    {
      enabled: selectedOrgValue !== "",
      refetchOnWindowFocus: false,
    },
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const trimmedSearch = search.trim().toLowerCase();
  const allEndpoints = endpointsQuery.data ?? [];
  const visibleEndpoints = useMemo(() => {
    return allEndpoints.filter((ep) => {
      // Status filter is applied first ; "failing" is the active rows
      // with a non-zero consecutive-failure counter, distinct from
      // operator-disabled rows.
      if (statusFilter === "active" && ep.status !== "active") return false;
      if (statusFilter === "disabled" && ep.status !== "disabled") return false;
      if (statusFilter === "failing" && !(ep.status === "active" && ep.consecutiveFailures > 0)) {
        return false;
      }
      if (trimmedSearch === "") return true;
      return (
        ep.name.toLowerCase().includes(trimmedSearch) ||
        ep.url.toLowerCase().includes(trimmedSearch) ||
        (ep.description?.toLowerCase().includes(trimmedSearch) ?? false)
      );
    });
  }, [allEndpoints, trimmedSearch, statusFilter]);

  type EndpointRow = (typeof allEndpoints)[number];

  const emptyLabels = useTableEmptyLabels({ query: search.trim(), noData: t("empty") });

  const layout = useDataTableLayout("admin-webhooks-table");

  const filterConfigs: FilterConfig[] = [
    {
      id: "status",
      label: t("filters.status"),
      value: statusFilter,
      onValueChange: (v) => setStatusFilter(v as StatusFilter),
      options: [
        { value: "all", label: t("filters.allStatuses") },
        { value: "active", label: t("filters.status_active") },
        { value: "disabled", label: t("filters.status_disabled") },
        { value: "failing", label: t("filters.status_failing") },
      ],
    },
  ];

  const primaryColumn: PrimaryColumnDef<EndpointRow> = {
    header: t("columns.name"),
    label: (ep) => ep.name,
    subtext: (ep) => <span className="font-mono">{ep.url}</span>,
    href: (ep) => `/admin/webhooks?webhook=${ep.id}`,
    enableSorting: true,
    sortAccessor: (ep) => ep.name,
    size: 320,
  };

  const endpointColumns: DataColumnDef<EndpointRow>[] = [
    {
      id: "status",
      header: t("columns.status"),
      cell: (ep) => (
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={ep.status} />
          {ep.consecutiveFailures > 0 && ep.status === "active" && (
            <Badge variant="warning" size="sm">
              {t("badges.failing", {
                count: ep.consecutiveFailures,
              })}
            </Badge>
          )}
        </span>
      ),
      size: 180,
    },
    {
      id: "subscriptions",
      header: t("columns.subscriptions"),
      align: "right",
      cell: (ep) => <span className="text-muted-foreground">{ep.subscriptions.length}</span>,
      enableSorting: true,
      sortAccessor: (ep) => ep.subscriptions.length,
      size: 120,
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
      clearAll: tFilters("clearAll"),
      resetField: tFilters("resetField"),
    },
  };

  return (
    <div className="space-y-4">
      <FilterBar
        search={
          <FilterBarSearch
            value={search}
            onChange={setSearch}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAria")}
          />
        }
        tools={
          <TableTools
            layout={layout}
            primaryColumn={primaryColumn}
            columns={endpointColumns}
            filters={filterConfigs}
            labels={toolsLabels}
            include={["filters", "sorting"]}
          />
        }
        actions={
          <div className="flex items-center gap-2">
            <TableTools
              layout={layout}
              primaryColumn={primaryColumn}
              columns={endpointColumns}
              labels={toolsLabels}
              include={["columns"]}
            />
            <Button type="button" onClick={panel.openCreate} disabled={selectedOrgValue === ""}>
              <Plus className="h-4 w-4" aria-hidden />
              {t("createCta")}
            </Button>
          </div>
        }
        mobileOptions={
          <TableTools
            mode="sheet"
            layout={layout}
            primaryColumn={primaryColumn}
            columns={endpointColumns}
            filters={filterConfigs}
            labels={toolsLabels}
            include={["filters", "sorting", "columns"]}
          />
        }
      />
      {!panel.isOpen && selectedOrgValue !== "" && (
        <CreateFab onClick={panel.openCreate} label={t("createCta")} />
      )}

      <TableDetailLayout
        open={panel.isOpen}
        onClose={panel.close}
        storageKey="admin-webhooks"
        panelClassName="sm:max-w-2xl"
        panel={
          <>
            <SheetTitle className="sr-only">
              {panel.isCreate ? t("panelCreateTitle") : t("panelEditTitle")}
            </SheetTitle>
            <PanelHeader
              title={panel.isCreate ? t("panelCreateTitle") : t("panelEditTitle")}
              onClose={panel.close}
              fullPageHref={
                !panel.isCreate && panel.selectedId
                  ? `/admin/webhooks/${panel.selectedId}`
                  : undefined
              }
              fullPageLabel={t("openFullPage")}
            />
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {panel.isCreate ? (
                <WebhookEditor
                  key="new"
                  mode="create"
                  organizationId={selectedOrgId}
                  containment="container"
                  onClose={panel.close}
                  onCreated={panel.open}
                />
              ) : panel.selectedId ? (
                <WebhookEditor
                  key={panel.selectedId}
                  mode="edit"
                  endpointId={panel.selectedId}
                  containment="container"
                  onClose={panel.close}
                  onCreated={panel.open}
                />
              ) : null}
            </div>
          </>
        }
        table={
          <DataTable
            data={visibleEndpoints}
            getRowId={(ep) => ep.id}
            storageKey="admin-webhooks-table"
            layout={layout}
            labels={{
              rowActions: tTable("rowActions"),
              errorTitle: tTable("loadError"),
              retry: tTable("retry"),
            }}
            selectedRowId={panel.selectedId}
            isLoading={endpointsQuery.isLoading}
            isError={endpointsQuery.isError}
            onRetry={() => endpointsQuery.refetch()}
            emptyState={
              <TableEmptyState
                reason={tableEmptyReason({
                  hasSearch: trimmedSearch !== "",
                  hasFilters: activeFilterCount(filterConfigs) > 0,
                })}
                labels={emptyLabels}
                onClearSearch={() => setSearch("")}
                onClearFilters={() => clearAllFilters(filterConfigs)}
                createAction={{ label: t("createCta"), onClick: panel.openCreate }}
              />
            }
            primaryColumn={primaryColumn}
            columns={endpointColumns}
          />
        }
      />
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "disabled" }) {
  const t = useTranslations("admin.webhooks.manager.status");
  return (
    <Badge variant={status === "active" ? "success" : "secondary"} size="sm">
      {t(status)}
    </Badge>
  );
}
