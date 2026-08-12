"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, Braces, KeyRound, ShieldAlert, UserCircle2, type LucideIcon } from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/sidebar";
import { trpc } from "@/lib/trpc";

type TabValue = "profile" | "security" | "notifications" | "apiKeys" | "danger";

const TABS: ReadonlyArray<{
  value: TabValue;
  href: string;
  icon: LucideIcon;
}> = [
  { value: "profile", href: "/account/profile", icon: UserCircle2 },
  { value: "security", href: "/account/security", icon: KeyRound },
  { value: "notifications", href: "/account/notifications", icon: Bell },
  { value: "apiKeys", href: "/account/api-keys", icon: Braces },
  { value: "danger", href: "/account/danger", icon: ShieldAlert },
];

// During the deletion grace period the user is locked out of every tab
// except `profile` (read-only) and `danger` (cancel-deletion). Hiding
// the rest in the rail tracks "limited access" UX ; the route layout
// also enforces this server-side via redirects, so a user who types a
// blocked URL still gets bounced. The client-side filter is just so
// the affordance is gone before they click.
const GRACE_TABS: ReadonlySet<TabValue> = new Set(["profile", "danger"]);

/**
 * Account-section sidebar. Same surface as before but each tab is a
 * real route segment now (`/account/profile`, `/account/security`, …)
 * instead of a `?tab=` query param ; the active item is derived from
 * `usePathname()`. The vertical rail mounts via `<SectionShell sidebar>`
 * on `xl+` ; the horizontal strip is `/account/layout.tsx`'s
 * `secondaryNav` for narrower viewports.
 */
export function AccountSidebar({
  orientation = "vertical",
}: {
  orientation?: "vertical" | "horizontal";
}) {
  const tNav = useTranslations("account.tabs");
  const pathname = usePathname();
  // `me.deletedAt` drives the "in grace period" lockdown : tabs filter
  // down to profile + danger. Cached aggressively since the value
  // doesn't flip mid-session ; the layout's server-side redirect is
  // the actual security boundary.
  const me = trpc.users.me.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const inGracePeriod = Boolean(me.data?.deletedAt);
  const visibleTabs = inGracePeriod ? TABS.filter((tab) => GRACE_TABS.has(tab.value)) : TABS;

  const items: SidebarItem[] = visibleTabs.map((tab) => ({
    key: tab.value,
    label: tNav(tab.value),
    icon: tab.icon,
    href: tab.href,
    active: pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  }));

  return <Sidebar items={items} ariaLabel={tNav("nav")} orientation={orientation} />;
}
