import { Building2, Database, KeyRound, Users, Webhook, type LucideIcon } from "lucide-react";

export type AdminTab = {
  id: "organizations" | "users" | "rbac" | "webhooks" | "dataModels";
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
 * "dataModels" is the schema-builder for the polymorphic Data Models
 * engine (@monark/data-models) — defining Data Models + their fields is
 * an admin-caliber, shape-the-system operation like organizations/rbac,
 * so it lives here rather than under `/data` (which is for *browsing
 * records*, gated by the finer-grained `data-models.record-*`
 * permissions instead of the coarse `isAdmin()` this section gates on).
 */
export const ADMIN_TABS: ReadonlyArray<AdminTab> = [
  { id: "organizations", href: "/admin/organizations", icon: Building2 },
  { id: "users", href: "/admin/users", icon: Users },
  { id: "rbac", href: "/admin/rbac", icon: KeyRound },
  { id: "webhooks", href: "/admin/webhooks", icon: Webhook },
  { id: "dataModels", href: "/admin/data-models", icon: Database },
];
