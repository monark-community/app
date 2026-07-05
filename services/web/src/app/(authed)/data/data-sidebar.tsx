"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sidebar, type SidebarItem } from "@/components/sidebar";
import { DATA_TABS } from "./data-tabs";

/**
 * Secondary nav shared by every `/data/*` route — the list of data
 * models (Projects, Industries, …). Mirrors the AdminSidebar: the
 * layout renders this once on `xl+` (vertical rail) and once inside the
 * mobile DataTabsBar (horizontal strip). Active item is derived from
 * the pathname so the shell stays decoupled from per-page state.
 */
export function DataSidebar({
  allowedIds,
  orientation = "vertical",
}: {
  /** Ids of the models the user may read ; resolved server-side in the layout. */
  allowedIds: readonly string[];
  orientation?: "vertical" | "horizontal";
}) {
  const t = useTranslations("data.tabs");
  const pathname = usePathname();

  const items: SidebarItem[] = DATA_TABS.filter((tab) => allowedIds.includes(tab.id)).map(
    (tab) => ({
      key: tab.id,
      label: t(tab.id),
      icon: tab.icon,
      href: tab.href,
      active: pathname === tab.href || pathname.startsWith(`${tab.href}/`),
    }),
  );

  return <Sidebar items={items} ariaLabel={t("nav")} orientation={orientation} />;
}
