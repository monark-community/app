"use client"

import Link from "next/link"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { ExternalLink, Grip } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { APPS } from "@/config/apps"
import { cn } from "@/lib/utils"

/**
 * Top-of-app launcher : a 3x3 grid icon in the AppBar that opens a
 * right-side drawer with a card per registered Monark app (Core,
 * accounting, trading, RWA, …). Sits to the left of the notifications
 * bell so it reads as a peer affordance to "user-scoped" surfaces, not
 * buried inside the user menu.
 *
 * Drawer pattern matches the user-menu and notifications drawers : a
 * `<Sheet side="right">` overlay sliding in from the right edge with
 * the SheetContent built-in close X. Cards close the drawer on click
 * so the user lands cleanly on the destination ; external apps open in
 * a new tab so the launcher's host session stays put.
 *
 * Server-side data isn't needed : the registry in `config/apps.ts` is
 * deploy-time config, not user state. That keeps this island light.
 */
export function AppLauncher() {
  const t = useTranslations("appBar.apps")
  const tItems = useTranslations("appBar.apps.items")
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t("triggerAria")}
          aria-expanded={open}
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Grip className="h-4 w-4" aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        // Lift the SheetContent built-in close X above the drawer body
        // (matches the user-menu + notifications drawers) so it stays
        // clickable.
        className="flex w-full flex-col gap-0 p-0 sm:max-w-sm [&>button]:z-50"
        aria-label={t("aria")}
      >
        <SheetTitle className="sr-only">{t("title")}</SheetTitle>

        <div className="border-b border-border p-4 pr-12">
          <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto p-4">
          {/*
            Two-column grid of app cards. Empty slot at the end so the
            grid reads as "registered + room for more" ; operators add
            entries to `config/apps.ts` as new products come online.
          */}
          <ul className="grid grid-cols-2 gap-2">
            {APPS.map((app) => {
              const Icon = app.icon
              const externalProps = app.external
                ? { target: "_blank" as const, rel: "noopener noreferrer" }
                : {}
              return (
                <li key={app.id}>
                  <Link
                    href={app.href}
                    onClick={() => setOpen(false)}
                    aria-current={app.current ? "true" : undefined}
                    {...externalProps}
                    className={cn(
                      "group flex h-full flex-col gap-1.5 rounded-md border p-3 text-left transition-colors",
                      app.current
                        ? "border-primary/40 bg-primary/5"
                        : "border-border hover:border-border hover:bg-muted/60",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <Icon
                        className={cn(
                          "h-5 w-5",
                          app.current
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-foreground",
                        )}
                        aria-hidden
                      />
                      {app.external && (
                        <ExternalLink
                          className="h-3 w-3 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium leading-tight">
                        {tItems(`${app.id}.name`)}
                      </p>
                      <p className="text-xs leading-snug text-muted-foreground">
                        {tItems(`${app.id}.tagline`)}
                      </p>
                    </div>
                    {app.current && (
                      <span className="mt-auto inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                        {t("currentBadge")}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
            <li aria-hidden>
              <div className="flex h-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border px-3 py-4 text-center">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("emptySlot")}
                </p>
              </div>
            </li>
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  )
}
