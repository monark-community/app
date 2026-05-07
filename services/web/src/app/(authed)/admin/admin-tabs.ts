import {
  Building2,
  KeyRound,
  Users,
  type LucideIcon,
} from "lucide-react"

export type AdminTab = {
  id: "organizations" | "users" | "rbac"
  href: `/admin/${string}`
  icon: LucideIcon
}

/**
 * The admin section's tab order. Single source of truth shared by the
 * AdminSidebar (renders one entry per tab, marks the active one) and
 * the `/admin` index page (server-redirects to the *first* tab so
 * admins land on something actionable instead of an empty section
 * header).
 *
 * Order : organization first since it's the spine of the deploy
 * (especially in single-tenant where it's the operator's own profile),
 * users next as the day-to-day surface, rbac last because role config
 * is rarer.
 */
export const ADMIN_TABS: ReadonlyArray<AdminTab> = [
  { id: "organizations", href: "/admin/organizations", icon: Building2 },
  { id: "users", href: "/admin/users", icon: Users },
  { id: "rbac", href: "/admin/rbac", icon: KeyRound },
]
