import {
  Building2,
  CalendarDays,
  KeyRound,
  LayoutDashboard,
  ShieldCheck,
  UserCircle,
  Users,
  Webhook,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * One navigable destination offered in the command palette's "Go to"
 * group. `id` is both the React key and the i18n key resolved as
 * `globalSearch.routes.<id>`. Admin-only entries mirror the drawer's
 * admin gate (the route's own server-side rbac check is the real
 * boundary — this is just a visibility affordance).
 */
export type SearchRoute = {
  id: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

export const SEARCH_ROUTES: SearchRoute[] = [
  { id: "dashboard", href: "/", icon: LayoutDashboard },
  { id: "calendar", href: "/calendar", icon: CalendarDays },
  { id: "account", href: "/account", icon: UserCircle },
  { id: "admin", href: "/admin", icon: ShieldCheck, adminOnly: true },
  { id: "adminUsers", href: "/admin/users", icon: Users, adminOnly: true },
  {
    id: "adminOrganizations",
    href: "/admin/organizations",
    icon: Building2,
    adminOnly: true,
  },
  { id: "adminRbac", href: "/admin/rbac", icon: KeyRound, adminOnly: true },
  { id: "adminWebhooks", href: "/admin/webhooks", icon: Webhook, adminOnly: true },
];
