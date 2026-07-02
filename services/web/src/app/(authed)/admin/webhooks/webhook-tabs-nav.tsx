"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Settings2, Inbox, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * Two-tab navigation shared by the webhook editor + the deliveries
 * list page. Tabs are real `<Link>`s pointed at sibling routes
 * (`/admin/webhooks/[id]` for Configuration, `/admin/webhooks/[id]/deliveries`
 * for Deliveries) so deep-linking + back-button navigation work as
 * expected.
 *
 * The Deliveries tab surfaces a destructive `<AlertTriangle />`
 * accent when the endpoint's delivery list contains at least one
 * `failed` row in the last batch. Cheap proxy for "this endpoint
 * needs operator attention" ; uses the existing list query so we
 * don't need a separate counts endpoint.
 */
export function WebhookTabsNav({
  endpointId,
  activeTab,
}: {
  endpointId: string;
  activeTab: "configuration" | "deliveries";
}) {
  const t = useTranslations("admin.webhooks.tabs");
  const pathname = usePathname();

  const deliveries = trpc.webhooks.listDeliveries.useQuery(
    { endpointId, limit: 50 },
    {
      // Cheap polling : the configuration tab refetches every 30s so
      // the danger badge appears within a window of an actual failure.
      // The deliveries tab itself refetches more aggressively from
      // its own page.
      refetchOnWindowFocus: true,
      refetchInterval: 30_000,
      enabled: pathname !== undefined,
    },
  );
  const hasFailures = (deliveries.data ?? []).some((d) => d.status === "failed");

  const tabs: Array<{
    id: "configuration" | "deliveries";
    href: string;
    label: string;
    Icon: typeof Settings2;
    danger?: boolean;
  }> = [
    {
      id: "configuration",
      href: `/admin/webhooks/${endpointId}`,
      label: t("configuration"),
      Icon: Settings2,
    },
    {
      id: "deliveries",
      href: `/admin/webhooks/${endpointId}/deliveries`,
      label: t("deliveries"),
      Icon: hasFailures ? AlertTriangle : Inbox,
      danger: hasFailures,
    },
  ];

  return (
    <nav aria-label={t("nav")} className="flex items-center gap-1 border-b border-border">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
              tab.danger && !isActive && "text-destructive hover:text-destructive/90",
              tab.danger && isActive && "border-destructive text-destructive",
            )}
          >
            <tab.Icon className="h-4 w-4" aria-hidden />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
