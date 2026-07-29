"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import { PRIMARY_NAV } from "@/config/primary-nav";
import { trpc } from "@/lib/trpc";

export type PrimaryNavItem = {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
};

export type ResolvedPrimaryNav = {
  /** Registered top-level destinations (flag-filtered, active-marked). */
  items: PrimaryNavItem[];
  /** The admin pin, present only when the user carries an admin role. */
  admin: { href: string; label: string; active: boolean } | null;
};

/**
 * The single source of resolved primary-nav state, shared by both
 * surfaces that render it : the desktop {@link NavRail} and the mobile
 * {@link PrimaryNavMenu} drawer. Reads {@link PRIMARY_NAV}, applies the
 * same flag / admin gating, resolves labels + active state — so the two
 * surfaces can never drift. Adding a destination is a one-line
 * `PRIMARY_NAV` entry + its `appBar.primaryNav.items.<id>` i18n key ;
 * nothing else in the nav chrome needs to change.
 *
 * Gating here is a UX affordance ; each route's own server gate is the
 * real boundary, so an optimistic show during the loading window is fine.
 */
export function usePrimaryNav(): ResolvedPrimaryNav {
  const tItems = useTranslations("appBar.primaryNav.items");
  const tBreadcrumb = useTranslations("appBar.breadcrumb");
  const pathname = usePathname();

  const isAdmin =
    trpc.rbac.isAdmin.useQuery(undefined, {
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    }).data === true;

  const flags =
    trpc.featureFlags.getAllForSession.useQuery(undefined, {
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    }).data ?? {};

  // "/" would match every path under `startsWith`, so it's special-cased.
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const items: PrimaryNavItem[] = PRIMARY_NAV.filter(
    (entry) => !entry.flag || flags[entry.flag] !== false,
  ).map((entry) => ({
    id: entry.id,
    href: entry.href,
    label: tItems(entry.id),
    icon: entry.icon,
    active: isActive(entry.href),
  }));

  const admin = isAdmin
    ? { href: "/admin", label: tBreadcrumb("admin"), active: isActive("/admin") }
    : null;

  return { items, admin };
}
