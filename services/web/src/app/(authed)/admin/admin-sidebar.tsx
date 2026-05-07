"use client"

import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { Sidebar, type SidebarItem } from "@/components/sidebar"
import { trpc } from "@/lib/trpc"
import { ADMIN_TABS } from "./admin-tabs"

/**
 * Sidebar shared by every `/admin/*` route. Mirrors the AccountShell
 * pattern : the layout renders this once on `xl+` (vertical) and once
 * inside the mobile content slot (horizontal strip). Active item is
 * derived from the pathname so the shell stays decoupled from
 * per-page state.
 *
 * Single-tenant deploys collapse the "Organizations" tab to its
 * singular form ("Organization") since the section only ever holds
 * one row ; the redirect from `/admin/organizations` to the
 * singleton's edit page is wired one level up so the active-state
 * highlighting still works off the shared `/admin/organizations` href.
 */
export function AdminSidebar({
  orientation = "vertical",
}: {
  orientation?: "vertical" | "horizontal"
}) {
  const tNav = useTranslations("admin.tabs")
  const pathname = usePathname()
  // Tenancy mode is stable across a session ; cache forever so this
  // doesn't refetch on every nav. The default-on-loading path matches
  // the new-tenant fresh-deploy case (single-tenant) so a user
  // refreshing on the admin surface doesn't see the label flicker.
  const status = trpc.organizations.bootstrapStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })
  const isSingleTenant = status.data?.mode !== "multi"

  // In single-tenant mode the redirect at `/admin/organizations` lands
  // on the singleton's edit page, but stopping there briefly is still
  // a stop. Re-target the tab href directly at the singleton's URL
  // when we know it ; the active-state regex still catches the prefix
  // so the highlight works regardless of which form of the href the
  // operator clicked.
  const singletonId = status.data?.singletonOrganizationId ?? null
  const items: SidebarItem[] = ADMIN_TABS.map((tab) => {
    const isOrgTab = tab.id === "organizations"
    const href: `/admin/${string}` =
      isOrgTab && isSingleTenant && singletonId
        ? `/admin/organizations/${singletonId}`
        : tab.href
    const labelKey = isOrgTab && isSingleTenant ? "organization" : tab.id
    return {
      key: tab.id,
      label: tNav(labelKey),
      icon: tab.icon,
      href,
      active:
        pathname === tab.href || pathname.startsWith(`${tab.href}/`),
    }
  })

  return (
    <Sidebar items={items} ariaLabel={tNav("nav")} orientation={orientation} />
  )
}
