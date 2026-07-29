import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppBarBreadcrumb } from "@/components/app-bar-breadcrumb";
import { BrandedAppLogoView, type BrandedAppLogoData } from "@/components/branded-app-logo-view";
import { GlobalSearchIconButton } from "@/components/global-search";
import { NotificationsBell } from "@/components/notifications-bell";
import { PrimaryNavMenu } from "@/components/primary-nav-menu";
import { UserMenu } from "@/components/user-menu";

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
 * bell, breadcrumb, drawer, and user menu. The brand mark
 * (`brandedLogoData`) is resolved once by the shared `(authed)/layout`
 * (which also feeds the NavRail) and passed in, so mounting the bar
 * never costs a second brand round-trip.
 */
export async function AppBar({ brandedLogoData }: { brandedLogoData: BrandedAppLogoData }) {
  const t = await getTranslations("appBar");

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
            The logo + breadcrumb give a "you are here" trail. On desktop
            the left NavRail owns the brand mark + primary nav, so the
            hamburger (in PrimaryNavMenu) and this logo are `md:hidden` ;
            on mobile they carry the brand + drawer trigger as before.
          */}
          <Link
            href="/"
            aria-label={brandedLogoData.singletonDisplayName ?? t("home")}
            className="flex items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden"
          >
            <BrandedAppLogoView data={brandedLogoData} size={28} />
          </Link>
          <AppBarBreadcrumb />
        </div>
        <div className="flex items-center gap-4">
          {/*
            Right side order (left→right): global search + notifications
            (tight cluster), then the user menu. The "Monark Apps" launcher
            is hidden for now (single product) — re-add `<AppLauncher />`
            here when a second product ships.
          */}
          <div className="flex items-center gap-1">
            <GlobalSearchIconButton />
            <NotificationsBell />
          </div>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
