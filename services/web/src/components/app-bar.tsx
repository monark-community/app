import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AppBarBreadcrumb } from "@/components/app-bar-breadcrumb"
import { AppLauncher } from "@/components/app-launcher"
import {
  BrandedAppLogoView,
  type BrandedAppLogoData,
} from "@/components/branded-app-logo"
import { NotificationsBell } from "@/components/notifications-bell"
import { PrimaryNavMenu } from "@/components/primary-nav-menu"
import { UserMenu } from "@/components/user-menu"
import { createServerTrpcClient } from "@/lib/trpc-server"

/**
 * Global application bar shown across all *authenticated* surfaces
 * (`/account`, `/account/*`, `/admin`). Sticky at the top, subtle
 * border-bottom, blurred background so content scrolling underneath
 * stays readable.
 *
 * The leading logo follows the singleton-org branding rules in
 * [BrandedAppLogo](./branded-app-logo.tsx) — same component the
 * pre-auth screens use, so the user sees consistent chrome from
 * sign-in through every authenticated page.
 *
 * Pre-auth pages (signin, signup, /auth/confirm-error, etc.) keep
 * their own centered "logo + form" layout instead of mounting this
 * bar ; the appbar implies "you're inside the app."
 *
 * Server component on purpose : the only client islands are the
 * bell, launcher, breadcrumb, drawer, and user menu. The drawer
 * (`PrimaryNavMenu`) gets the resolved logo data passed in as a prop
 * so its drawer header renders the same brand mark without a second
 * round-trip.
 */
export async function AppBar() {
  const t = await getTranslations("appBar")

  // Single source of truth for the brand mark : `bootstrapStatus`.
  // Public procedure, no auth roundtrip needed even though we're in
  // an authenticated tree. Best-effort — falls through to the
  // starter-template brand on api failure.
  const status = await createServerTrpcClient()
    .organizations.bootstrapStatus.query()
    .catch(() => null)

  const brandedLogoData: BrandedAppLogoData = {
    singletonLogoUrl: status?.singletonLogoUrl ?? null,
    singletonDisplayName: status?.singletonDisplayName ?? null,
    isSingleTenantBootstrapped:
      status?.mode === "single" && Boolean(status?.bootstrapped),
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/70">
      {/*
        Full-width row (no `max-w-*` cap) : hamburger + logo + breadcrumb
        flush-left of the screen, app launcher + bell + user menu
        flush-right. The hamburger opens the primary-nav drawer ; the
        logo links back to home ; the breadcrumb gives the user a "you
        are here" trail derived from the URL.
      */}
      <div className="flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <PrimaryNavMenu brandedLogoData={brandedLogoData} />
          {/*
            Only the logo links to `/`. The breadcrumb sits beside it as
            a series of links + a final non-interactive span, so the
            user can step back up the tree without hitting "/" by
            accident. The primary nav drawer (hamburger) is the
            canonical "go somewhere else" affordance.
          */}
          <Link
            href="/"
            aria-label={brandedLogoData.singletonDisplayName ?? t("home")}
            className="flex items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <BrandedAppLogoView data={brandedLogoData} size={28} />
          </Link>
          <AppBarBreadcrumb />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <AppLauncher />
            <NotificationsBell />
          </div>
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
