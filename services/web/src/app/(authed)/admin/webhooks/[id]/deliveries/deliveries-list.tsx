"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/page-header"
import { trpc } from "@/lib/trpc"
import { WebhookTabsNav } from "../../webhook-tabs-nav"

type DeliveryStatus = "pending" | "delivered" | "failed"

function deliveryStatusVariant(
  status: DeliveryStatus,
): "success" | "destructive" | "warning" {
  if (status === "delivered") return "success"
  if (status === "failed") return "destructive"
  return "warning"
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
  const t = useTranslations("admin.webhooks.deliveries")
  const tEditor = useTranslations("admin.webhooks.editor")
  const tStatus = useTranslations("admin.webhooks.deliveries.status")
  const endpoint = trpc.webhooks.get.useQuery(
    { id: endpointId },
    { refetchOnWindowFocus: false },
  )
  const deliveries = trpc.webhooks.listDeliveries.useQuery(
    { endpointId, limit: 50 },
    { refetchOnWindowFocus: false },
  )

  const headerTitle = endpoint.data?.name
    ? tEditor("editTitle", { name: endpoint.data.name })
    : tEditor("editTitleFallback")
  // Match the configuration tab's subtitle so switching tabs doesn't
  // shift the page vertically. PageHeader's subtitle slot reserves
  // line height ; an empty subtitle would collapse and bump the
  // tab nav up by a row.
  const headerSubtitle = tEditor("editSubtitle")

  if (deliveries.isLoading) {
    return (
      <div className="space-y-8">
        <PageHeader
          title={headerTitle}
          subtitle={headerSubtitle}
          backHref="/admin/webhooks"
          backLabel={tEditor("back")}
        />
        <WebhookTabsNav endpointId={endpointId} activeTab="deliveries" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const rows = deliveries.data ?? []

  return (
    <div className="space-y-8">
      <PageHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        backHref="/admin/webhooks"
        backLabel={tEditor("back")}
      />

      <WebhookTabsNav endpointId={endpointId} activeTab="deliveries" />

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {rows.map((row) => {
            const statusLabel = tStatus(row.status)
            return (
              <li key={row.id}>
                <Link
                  href={`/admin/webhooks/${endpointId}/deliveries/${row.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus:outline-none focus-visible:bg-muted/50"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-foreground">
                        {row.eventType}
                      </span>
                      <Badge variant={deliveryStatusVariant(row.status)} size="sm">
                        {statusLabel}
                      </Badge>
                      {row.status !== "delivered" && (
                        <span className="text-[11px] text-muted-foreground">
                          {t("attemptsCount", { count: row.attempts })}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t("createdAt", {
                        date: new Date(row.createdAt).toLocaleString(),
                      })}
                    </p>
                    {row.lastError && (
                      <p className="truncate text-xs text-red-700 dark:text-red-400">
                        {row.lastError}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
