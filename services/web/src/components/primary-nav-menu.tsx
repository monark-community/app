"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { Menu, ShieldCheck } from "lucide-react"
import {
  BrandedAppLogoView,
  type BrandedAppLogoData,
} from "@/components/branded-app-logo"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { PRIMARY_NAV } from "@/config/primary-nav"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"

/**
 * Hamburger trigger + slide-in drawer that holds the app's *primary*
 * navigation. Lives on the left side of the AppBar so it's reachable
 * from any authenticated route ; the drawer overlays content (Sheet
 * with `side="left"`) instead of being part of layout. Closes on
 * navigation so the user lands on the destination page with the rail
 * dismissed.
 *
 * The entries shown are read from `config/primary-nav.ts`. Modules
 * that want a primary surface opt-in there ; modules that don't ship
 * one (auth, notifications, branding, …) never appear. When the
 * registry is empty (the starter's default state — no modules
 * registered) the drawer renders an empty state instead of a
 * misleading placeholder list. Each module is responsible for its own
 * *secondary* nav (sub-routes inside the module surface) ; the
 * primary drawer is strictly top-level.
 */
export function PrimaryNavMenu({
  brandedLogoData,
}: {
  // Resolved by the server-rendered `AppBar` parent so the drawer
  // header renders the same brand mark as the AppBar without a second
  // tRPC roundtrip from this client component.
  brandedLogoData: BrandedAppLogoData
}) {
  const t = useTranslations("appBar.primaryNav")
  const tItems = useTranslations("appBar.primaryNav.items")
  const tBreadcrumb = useTranslations("appBar.breadcrumb")
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // Only fetched when the drawer's parent is mounted (i.e. on every
  // authed page). `staleTime: Infinity` because admin status doesn't
  // flip mid-session in any flow we care about ; the link's visibility
  // is a UX affordance, not a security boundary (the admin route's own
  // server-side gate is). Default to false during the loading window
  // so the link doesn't flash for non-admins on first paint.
  const adminQuery = trpc.rbac.isAdmin.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })
  const isAdmin = adminQuery.data === true
  const adminActive =
    pathname === "/admin" || pathname.startsWith("/admin/")

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t("triggerAria")}
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Menu className="h-4 w-4" aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        // Drop default padding on the wrapper so the brand block can sit
        // flush against the top edge ; the close affordance from the
        // Sheet primitive sits in the top-right corner already.
        // `flex flex-col h-full` so the middle nav region can grow + scroll
        // while the admin pin (when present) stays anchored to the bottom.
        className="flex w-72 flex-col p-0 sm:max-w-sm"
        aria-label={t("aria")}
      >
        {/*
          Brand header at the top of the drawer mirrors the AppBar shape
          (logo + wordmark, same gap, same size). Clicking it goes to /
          like the AppBar logo. SheetTitle (visually-hidden) gives the
          dialog a Radix-required accessible name without showing redundant
          chrome.
        */}
        <SheetTitle className="sr-only">{t("aria")}</SheetTitle>
        <Link
          href="/"
          onClick={() => setOpen(false)}
          aria-label={t("brandHomeAria")}
          className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <BrandedAppLogoView data={brandedLogoData} size={28} />
          <span className="text-base font-semibold tracking-tight">
            {t("brandWordmark")}
          </span>
        </Link>
        {/*
          Middle region : the registered module entries. `flex-1` claims
          the space between the brand header and the admin pin ;
          `overflow-y-auto` so a long registry scrolls without pushing
          the admin pin off-screen.
        */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
          {PRIMARY_NAV.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            PRIMARY_NAV.map((entry) => {
              const Icon = entry.icon
              // Special-case the root: `pathname.startsWith("/")` matches
              // every path, so a "/" entry would always show as active.
              const active =
                entry.href === "/"
                  ? pathname === "/"
                  : pathname === entry.href ||
                    pathname.startsWith(`${entry.href}/`)
              return (
                <Link
                  key={entry.id}
                  href={entry.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span>{tItems(entry.id)}</span>
                </Link>
              )
            })
          )}
        </nav>
        {/*
          Admin pin : fixed at the drawer footer when the signed-in user
          carries an admin role. Top border separates it visually from
          the scrollable nav region above. Filled-orange Button (default
          variant — `--primary` is the brand orange, `--primary-foreground`
          is near-black) so it stands out from the muted module entries
          above ; admin surfaces are intentionally privileged. Hidden for
          non-admins ; the /admin route's server-side rbac gate is the
          actual security boundary.
        */}
        {isAdmin && (
          <div className="shrink-0 border-t border-border p-4">
            <Button
              asChild
              className="w-full justify-start"
              aria-current={adminActive ? "page" : undefined}
            >
              <Link href="/admin" onClick={() => setOpen(false)}>
                <ShieldCheck aria-hidden />
                <span>{tBreadcrumb("admin")}</span>
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
