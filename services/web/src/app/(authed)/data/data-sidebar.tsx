"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Database, type LucideIcon } from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/sidebar";
import type { DataTab, DataTabIcon } from "./data-tabs";

// Resolves the serializable `DataTabIcon` key (see `data-tabs.ts` for why
// tabs carry a string instead of a component) back to the real Lucide
// component, client-side where a function value is fine to hold.
const TAB_ICONS: Record<DataTabIcon, LucideIcon> = {
  database: Database,
};

/**
 * Secondary nav shared by every `/data/*` route — one entry per
 * dynamically-registered Data Model. Mirrors the AdminSidebar: the
 * `SectionShell` renders this once on `xl+` (vertical rail) and once as
 * the mobile horizontal strip. Active item is derived from the pathname
 * so the shell stays decoupled from per-page state.
 */
export function DataSidebar({
  tabs,
  allowedIds,
  orientation = "vertical",
}: {
  /** Static + dynamically-registered tabs, already merged and ordered by
   * the layout (which is the only place that can fetch the org's Data
   * Models). */
  tabs: readonly DataTab[];
  /** Ids of the models the user may read ; resolved server-side in the layout. */
  allowedIds: readonly string[];
  orientation?: "vertical" | "horizontal";
}) {
  const t = useTranslations("data.tabs");
  const pathname = usePathname();

  const items: SidebarItem[] = tabs
    .filter((tab) => allowedIds.includes(tab.id))
    .map((tab) => ({
      key: tab.id,
      label: tab.label ?? t(tab.id),
      icon: TAB_ICONS[tab.icon],
      href: tab.href,
      active: pathname === tab.href || pathname.startsWith(`${tab.href}/`),
    }));

  return <Sidebar items={items} ariaLabel={t("nav")} orientation={orientation} />;
}
