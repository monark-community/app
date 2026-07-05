"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  FilterBar,
  TableTools,
  useDataTableLayout,
  type DataColumnDef,
  type PrimaryColumnDef,
  type TableToolsLabels,
} from "@/components/patterns";
import { PageHeader } from "@/components/page-header";
import { trpc } from "@/lib/trpc";
import { WebhookTabsNav } from "../../webhook-tabs-nav";

type DeliveryStatus = "pending" | "delivered" | "failed";

function deliveryStatusVariant(status: DeliveryStatus): "success" | "destructive" | "warning" {
  if (status === "delivered") return "success";
  if (status === "failed") return "destructive";
  return "warning";
}

/**
 * Per-endpoint delivery history. The table is the operator's first
 * stop when a webhook isn't behaving ; every attempt's status, the
 * last error, the retry count are visible without reaching for SQL.
 * Click a row → per-delivery inspection page (payload + attempt log +
 * manual retry).
 *
 * Pagination is cursor-based per the tRPC router ; today the page
 * shows the first 50 rows, "load more" lands when actual deploys hit
 * the limit. Switches between Configuration ↔ Deliveries via the
 * shared `<WebhookTabsNav>` so the operator stays in context.
 */
export function DeliveriesList({ endpointId }: { endpointId: string }) {
  const t = useTranslations("admin.webhooks.deliveries");
  const tEditor = useTranslations("admin.webhooks.editor");
  const tStatus = useTranslations("admin.webhooks.deliveries.status");
  const tTable = useTranslations("table");
  const tFilters = useTranslations("filters");
  const endpoint = trpc.webhooks.get.useQuery({ id: endpointId }, { refetchOnWindowFocus: false });
  const deliveries = trpc.webhooks.listDeliveries.useQuery(
    { endpointId, limit: 50 },
    { refetchOnWindowFocus: false },
  );

  const headerTitle = endpoint.data?.name
    ? tEditor("editTitle", { name: endpoint.data.name })
    : tEditor("editTitleFallback");
  // Match the configuration tab's subtitle so switching tabs doesn't
  // shift the page vertically. PageHeader's subtitle slot reserves
  // line height ; an empty subtitle would collapse and bump the
  // tab nav up by a row.
  const headerSubtitle = tEditor("editSubtitle");

  const rows = deliveries.data ?? [];

  type DeliveryRow = (typeof rows)[number];

  const layout = useDataTableLayout("admin-webhook-deliveries-table");

  const primaryColumn: PrimaryColumnDef<DeliveryRow> = {
    header: t("columns.event"),
    label: (row) => <span className="font-mono text-xs">{row.eventType}</span>,
    subtext: (row) =>
      row.lastError ? (
        <span className="text-red-700 dark:text-red-400">{row.lastError}</span>
      ) : undefined,
    href: (row) => `/admin/webhooks/${endpointId}/deliveries/${row.id}`,
    enableSorting: true,
    sortAccessor: (row) => row.eventType,
    size: 320,
  };

  const deliveryColumns: DataColumnDef<DeliveryRow>[] = [
    {
      id: "status",
      header: t("columns.status"),
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant={deliveryStatusVariant(row.status)} size="sm">
            {tStatus(row.status)}
          </Badge>
          {row.status !== "delivered" && (
            <span className="text-[11px] text-muted-foreground">
              {t("attemptsCount", { count: row.attempts })}
            </span>
          )}
        </span>
      ),
      size: 180,
    },
    {
      id: "createdAt",
      header: t("columns.when"),
      align: "right",
      cell: (row) => (
        <span className="text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</span>
      ),
      enableSorting: true,
      sortAccessor: (row) => new Date(row.createdAt),
      size: 200,
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
    <div className="space-y-8">
      <PageHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        backHref="/admin/webhooks"
        backLabel={tEditor("back")}
      />

      <WebhookTabsNav endpointId={endpointId} activeTab="deliveries" />

      <div className="space-y-3">
        <FilterBar
          tools={
            <TableTools
              layout={layout}
              primaryColumn={primaryColumn}
              columns={deliveryColumns}
              labels={toolsLabels}
            />
          }
        />

        <div className="rounded-lg border border-border">
          <DataTable
            data={rows}
            getRowId={(row) => row.id}
            storageKey="admin-webhook-deliveries-table"
            layout={layout}
            labels={{
              rowActions: tTable("rowActions"),
              errorTitle: tTable("loadError"),
              retry: tTable("retry"),
            }}
            isLoading={deliveries.isLoading}
            isError={deliveries.isError}
            onRetry={() => deliveries.refetch()}
            emptyState={t("empty")}
            primaryColumn={primaryColumn}
            columns={deliveryColumns}
          />
        </div>
      </div>
    </div>
  );
}
