import { Building2, KeyRound, Users, Webhook, type LucideIcon } from "lucide-react";

export type AdminTab = {
  id: "organizations" | "users" | "rbac" | "webhooks";
  href: `/admin/${string}`;
  icon: LucideIcon;
};

/**
 * The admin section's tab order. Single source of truth shared by the
 * AdminSidebar (renders one entry per tab, marks the active one) and
 * the `/admin` index page (server-redirects to the *first* tab so
 * admins land on something actionable instead of an empty section
 * header).
 *
 * Projects and industries are module-level surfaces gated by
 * `projects.read` / `industries.read` permissions ; they live under
 * `/(authed)/projects` and `/(authed)/industries` and are reached via
 * the primary nav drawer instead.
 */
export const ADMIN_TABS: ReadonlyArray<AdminTab> = [
  { id: "organizations", href: "/admin/organizations", icon: Building2 },
  { id: "users", href: "/admin/users", icon: Users },
  { id: "rbac", href: "/admin/rbac", icon: KeyRound },
  { id: "webhooks", href: "/admin/webhooks", icon: Webhook },
];
