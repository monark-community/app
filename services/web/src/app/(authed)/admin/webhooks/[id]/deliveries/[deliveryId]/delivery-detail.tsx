"use client";

import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { trpc } from "@/lib/trpc";

type DeliveryStatus = "pending" | "delivered" | "failed";

function deliveryStatusVariant(status: DeliveryStatus): "success" | "destructive" | "warning" {
  if (status === "delivered") return "success";
  if (status === "failed") return "destructive";
  return "warning";
}

/**
 * Per-delivery inspection page. Renders :
 *
 *   - The delivery's identity (event type, idempotency key, status,
 *     attempt count, next-attempt schedule).
 *   - The captured payload, JSON-pretty-printed so an operator
 *     comparing against their receiver's logs can search.
 *   - The per-attempt audit (status code / network error /
 *     duration), so a flaky receiver's pattern (steady-200s then a
 *     burst of 503s, etc.) is visible without going to SQL.
 *   - A "Retry" button that calls `webhooks.retryDelivery` ; the
 *     server kicks one synchronous attempt inline so the new row
 *     surfaces in the attempt log on refetch without waiting for the
 *     next worker tick.
 */
export function DeliveryDetail({
  endpointId,
  deliveryId,
}: {
  endpointId: string;
  deliveryId: string;
}) {
  const t = useTranslations("admin.webhooks.delivery");
  const tStatus = useTranslations("admin.webhooks.deliveries.status");
  const utils = trpc.useUtils();
  const query = trpc.webhooks.getDelivery.useQuery(
    { id: deliveryId },
    { refetchOnWindowFocus: false },
  );
  // Look up the event-type description from the registry so the
  // header isn't just the dotted technical id (which the operator
  // might mis-read as a missing i18n key). The query is cached
  // 5 minutes by the picker too, so this is a free read here.
  const eventTypes = trpc.webhooks.listEventTypes.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const retryMutation = trpc.webhooks.retryDelivery.useMutation({
    onSuccess: async () => {
      toast.success(t("retrySuccess"));
      await utils.webhooks.getDelivery.invalidate({ id: deliveryId });
      await utils.webhooks.listDeliveries.invalidate({ endpointId });
    },
    onError: (err) => toast.error(err.message || t("retryError")),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="…"
          backHref={`/admin/webhooks/${endpointId}/deliveries`}
          backLabel={t("back")}
        />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="…"
          backHref={`/admin/webhooks/${endpointId}/deliveries`}
          backLabel={t("back")}
        />
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("notFound")}
        </p>
      </div>
    );
  }

  const { delivery, attempts } = query.data;
  const eventDescription = (() => {
    for (const group of eventTypes.data?.groups ?? []) {
      for (const ev of group.events) {
        if (ev.type === delivery.eventType) return ev.description;
      }
    }
    return null;
  })();
  return (
    <div className="space-y-8">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{delivery.eventType}</span>
            <Badge variant={deliveryStatusVariant(delivery.status)} size="sm">
              {tStatus(delivery.status)}
            </Badge>
          </span>
        }
        subtitle={
          <>
            {eventDescription && <span className="block">{eventDescription}</span>}
            <span className="block text-xs">
              {t("createdAt", {
                date: new Date(delivery.createdAt).toLocaleString(),
              })}
            </span>
          </>
        }
        backHref={`/admin/webhooks/${endpointId}/deliveries`}
        backLabel={t("back")}
      />

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-md border border-border p-4 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("idempotencyKey")}
          </dt>
          <dd className="break-all font-mono text-xs">{delivery.idempotencyKey}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("attempts")}</dt>
          <dd className="text-xs">{delivery.attempts}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("nextAttemptAt")}
          </dt>
          <dd className="text-xs">
            {delivery.deliveredAt
              ? t("delivered", {
                  date: new Date(delivery.deliveredAt).toLocaleString(),
                })
              : delivery.failedAt
                ? t("permanentlyFailed", {
                    date: new Date(delivery.failedAt).toLocaleString(),
                  })
                : new Date(delivery.nextAttemptAt).toLocaleString()}
          </dd>
        </div>
        {delivery.lastError && (
          <div className="flex items-start gap-2 sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("lastError")}
            </dt>
            <dd className="text-xs text-red-700 dark:text-red-400">{delivery.lastError}</dd>
          </div>
        )}
      </dl>

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => retryMutation.mutate({ id: deliveryId })}
          disabled={retryMutation.isPending}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {retryMutation.isPending ? t("retrying") : t("retryCta")}
        </Button>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("payloadTitle")}</h2>
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
          {JSON.stringify(delivery.payload, null, 2)}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("attemptLogTitle")}</h2>
        {attempts.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            {t("attemptLogEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {attempts.map((attempt) => {
              const ok =
                attempt.statusCode !== null &&
                attempt.statusCode >= 200 &&
                attempt.statusCode < 300;
              return (
                <li
                  key={attempt.id}
                  className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs"
                >
                  <span className="font-mono text-muted-foreground">#{attempt.attemptNumber}</span>
                  <span
                    className={
                      ok
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-red-700 dark:text-red-400"
                    }
                  >
                    {attempt.statusCode !== null ? `HTTP ${attempt.statusCode}` : t("networkError")}
                  </span>
                  {attempt.durationMs !== null && (
                    <span className="text-muted-foreground">
                      {t("durationMs", { ms: attempt.durationMs })}
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {new Date(attempt.startedAt).toLocaleString()}
                  </span>
                  {attempt.error && (
                    <span className="basis-full break-all text-red-700 dark:text-red-400">
                      {attempt.error}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
