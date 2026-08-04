"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format-time";
import { trpc } from "@/lib/trpc";
import { CollapsibleSection } from "../collapsible-section";

function statusClass(status: string): string {
  if (status === "delivered") return "bg-emerald-400/20 text-emerald-400";
  if (status === "failed" || status === "dead") return "bg-red-400/20 text-red-400";
  return "bg-border text-muted-foreground";
}

/**
 * Dev-only webhook deliveries feed. Pick one of the org's endpoints and see its
 * recent deliveries (event · status · attempts · when · last error), with a
 * one-tap redeliver. Pairs with the event-bus tap ("event fired → did it
 * deliver?"). Reuses `webhooks.list` / `listDeliveries` / `retryDelivery`.
 */
export function WebhookDeliveriesPanel() {
  const t = useTranslations("devOverlay");
  const locale = useLocale();
  const utils = trpc.useUtils();

  const session = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const signedIn = Boolean(session.data);

  const current = trpc.organizations.current.useQuery(undefined, { refetchOnWindowFocus: false });
  const mine = trpc.organizations.mine.useQuery(undefined, { refetchOnWindowFocus: false });
  const orgId = current.data?.id ?? mine.data?.[0]?.id ?? null;

  const endpointsQuery = trpc.webhooks.list.useQuery(
    { organizationId: orgId },
    { enabled: signedIn && orgId !== null, refetchOnWindowFocus: false, retry: false },
  );
  const endpoints = endpointsQuery.data ?? [];

  const [endpointId, setEndpointId] = useState("");
  useEffect(() => {
    if (!endpointId && endpoints[0]) setEndpointId(endpoints[0].id);
  }, [endpoints, endpointId]);

  const deliveriesQuery = trpc.webhooks.listDeliveries.useQuery(
    { endpointId, limit: 20 },
    { enabled: endpointId !== "", refetchOnWindowFocus: false, retry: false },
  );
  const retry = trpc.webhooks.retryDelivery.useMutation({
    onSuccess: () => void utils.webhooks.listDeliveries.invalidate({ endpointId }),
  });

  const deliveries = deliveriesQuery.data ?? [];

  const badge = (
    <span className="rounded-full bg-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {t("webhookDeliveries.count", { count: endpoints.length })}
    </span>
  );

  return (
    <CollapsibleSection title={t("sections.webhookDeliveries")} badge={badge}>
      {!signedIn ? (
        <p className="text-xs text-muted-foreground">{t("webhookDeliveries.signInPrompt")}</p>
      ) : endpointsQuery.isError ? (
        <p className="text-xs text-muted-foreground">{t("webhookDeliveries.unavailable")}</p>
      ) : endpoints.length === 0 ? (
        <p className="text-xs opacity-60">{t("webhookDeliveries.noEndpoints")}</p>
      ) : (
        <div className="space-y-3">
          <select
            value={endpointId}
            onChange={(e) => setEndpointId(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            aria-label={t("webhookDeliveries.endpoint")}
          >
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.name || ep.url}
              </option>
            ))}
          </select>

          {deliveriesQuery.isLoading ? (
            <p className="text-xs opacity-60">…</p>
          ) : deliveries.length === 0 ? (
            <p className="text-xs opacity-60">{t("webhookDeliveries.empty")}</p>
          ) : (
            <ul className="space-y-1.5">
              {deliveries.map((d) => (
                <li key={d.id} className="rounded border border-border p-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase ${statusClass(d.status)}`}
                    >
                      {d.status}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                      {d.eventType}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {t("webhookDeliveries.attempts", { count: d.attempts })}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatRelativeTime(d.createdAt, locale)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground [&_svg]:size-3"
                      title={t("webhookDeliveries.retry")}
                      aria-label={t("webhookDeliveries.retry")}
                      disabled={retry.isPending}
                      onClick={() => retry.mutate({ id: d.id })}
                    >
                      <RotateCcw aria-hidden />
                    </Button>
                  </div>
                  {d.lastError && (
                    <p className="mt-1 break-all text-[10px] text-destructive">{d.lastError}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
