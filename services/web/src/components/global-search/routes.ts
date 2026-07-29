import {
  Building2,
  KeyRound,
  LayoutDashboard,
  ShieldCheck,
  UserCircle,
  Users,
  Webhook,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PRIMARY_NAV } from "@/config/primary-nav";

/**
 * One navigable destination offered in the command palette's "Go to" group.
 * `labelKey` is a full i18n key (the source namespace differs : module surfaces
 * reuse the drawer's own `appBar.primaryNav.items.*` strings, app-shell routes
 * live under `globalSearch.routes.*`). Admin-only entries mirror the drawer's
 * admin gate — the route's own server-side rbac check is the real boundary,
 * this is just a visibility affordance.
 */
export type SearchRoute = {
  id: string;
  href: string;
  icon: LucideIcon;
  labelKey: string;
  adminOnly?: boolean;
};

// The app dashboard — a shell route, so it isn't in PRIMARY_NAV (the drawer
// lists module surfaces, not the home page). Kept first in the palette.
const DASHBOARD_ROUTE: SearchRoute = {
  id: "dashboard",
  href: "/",
  icon: LayoutDashboard,
  labelKey: "globalSearch.routes.dashboard",
};

// Module surfaces come straight from the drawer's single source of truth, so
// the palette can never drift from the drawer again : a module that adds a
// PRIMARY_NAV entry is searchable in "Go to" with no extra step. Labels reuse
// the drawer's own strings, so a section reads identically in both places.
const NAV_ROUTES: SearchRoute[] = PRIMARY_NAV.map((entry) => ({
  id: entry.id,
  href: entry.href,
  icon: entry.icon,
  labelKey: `appBar.primaryNav.items.${entry.id}`,
}));

// Account + admin surfaces : shell/admin routes that aren't module drawer
// entries. Their admin-gate mirrors the drawer's admin section.
const SHELL_ROUTES: SearchRoute[] = [
  { id: "account", href: "/account", icon: UserCircle, labelKey: "globalSearch.routes.account" },
  {
    id: "admin",
    href: "/admin",
    icon: ShieldCheck,
    adminOnly: true,
    labelKey: "globalSearch.routes.admin",
  },
  {
    id: "adminUsers",
    href: "/admin/users",
    icon: Users,
    adminOnly: true,
    labelKey: "globalSearch.routes.adminUsers",
  },
  {
    id: "adminOrganizations",
    href: "/admin/organizations",
    icon: Building2,
    adminOnly: true,
    labelKey: "globalSearch.routes.adminOrganizations",
  },
  {
    id: "adminRbac",
    href: "/admin/rbac",
    icon: KeyRound,
    adminOnly: true,
    labelKey: "globalSearch.routes.adminRbac",
  },
  {
    id: "adminWebhooks",
    href: "/admin/webhooks",
    icon: Webhook,
    adminOnly: true,
    labelKey: "globalSearch.routes.adminWebhooks",
  },
];

export const SEARCH_ROUTES: SearchRoute[] = [DASHBOARD_ROUTE, ...NAV_ROUTES, ...SHELL_ROUTES];
