"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ShieldCheck, type LucideIcon } from "lucide-react";
import { BrandedAppLogoView, type BrandedAppLogoData } from "@/components/branded-app-logo-view";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePrimaryNav } from "@/hooks/use-primary-nav";
import { cn } from "@/lib/utils";

export type NavRailItem = {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
};

/**
 * Presentation of the desktop primary-nav rail (`md+`). A slim icon
 * column pinned to the left edge : brand mark at the top (links home),
 * the primary destinations as icons in the middle, and an optional admin
 * pin at the bottom. Each icon shows its label as a tooltip on hover /
 * focus and carries an `aria-label` for screen readers.
 *
 * Pure / data-free so it can be previewed in isolation ; {@link NavRail}
 * supplies the live items + gating. The rail is `hidden` below `md`,
 * where the hamburger drawer ({@link PrimaryNavMenu}) takes over ; the
 * app shell (`(authed)/layout`) offsets its content by the rail width.
 */
export function NavRailView({
  brandedLogoData,
  items,
  admin,
  ariaLabel,
  brandHomeAria,
}: {
  brandedLogoData: BrandedAppLogoData;
  items: NavRailItem[];
  admin?: { href: string; label: string; active: boolean } | null;
  ariaLabel: string;
  brandHomeAria: string;
}) {
  return (
    <TooltipProvider delayDuration={0}>
      <nav
        aria-label={ariaLabel}
        className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col items-center border-r border-border bg-background md:flex"
      >
        {/*
          `box-content` so the `border-b` sits OUTSIDE the 56px (`h-14`) logo
          square, exactly like the AppBar — whose border-b is on the outer
          <header>, below its own `h-14` row. Under the global border-box default
          the border would eat into the 56px and land the divider 1px above the
          AppBar's, breaking the horizontal line where rail meets bar.
        */}
        <Link
          href="/"
          aria-label={brandHomeAria}
          className="box-content flex h-14 w-full shrink-0 items-center justify-center overflow-hidden border-b border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <BrandedAppLogoView data={brandedLogoData} size={28} />
        </Link>

        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-3">
          {items.map((item) => (
            <RailLink
              key={item.id}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={item.active}
            />
          ))}
        </div>

        {admin ? (
          <div className="flex w-full shrink-0 flex-col items-center border-t border-border py-3">
            <RailLink
              href={admin.href}
              label={admin.label}
              icon={ShieldCheck}
              active={admin.active}
            />
          </div>
        ) : null}
      </nav>
    </TooltipProvider>
  );
}

/**
 * Live desktop primary-nav rail. Reads the same `PRIMARY_NAV` source and
 * the same flag / admin gating as {@link PrimaryNavMenu} (the mobile
 * hamburger drawer) so the two surfaces stay in lockstep, then renders
 * {@link NavRailView}. Visibility gating is a UX affordance ; each
 * route's own server gate is the real boundary.
 */
export function NavRail({ brandedLogoData }: { brandedLogoData: BrandedAppLogoData }) {
  const t = useTranslations("appBar.primaryNav");
  const { items, admin } = usePrimaryNav();
  return (
    <NavRailView
      brandedLogoData={brandedLogoData}
      items={items}
      admin={admin}
      ariaLabel={t("aria")}
      brandHomeAria={t("brandHomeAria")}
    />
  );
}

function RailLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            active
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
