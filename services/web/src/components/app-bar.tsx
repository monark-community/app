import { AppBarBreadcrumb } from "@/components/app-bar-breadcrumb";
import { type BrandedAppLogoData } from "@/components/branded-app-logo-view";
import { ChatLauncherButton } from "@/components/chat";
import { GlobalSearchIconButton } from "@/components/global-search";
import { PrimaryNavMenu } from "@/components/primary-nav-menu";
import { UserMenu } from "@/components/user-menu";

/**
 * Global application bar shown across all *authenticated* surfaces
 * (`/account`, `/account/*`, `/admin`). Sticky at the top, subtle
 * border-bottom, blurred background so content scrolling underneath
 * stays readable.
 *
 * Left (mobile): a single merged brand+menu mark (in `PrimaryNavMenu`) that
 * both shows the brand and opens the primary-nav drawer — "Home" lives inside
 * that drawer — followed by the breadcrumb. On desktop the left NavRail owns the
 * brand + nav, so the mark is `md:hidden`.
 *
 * Right: the AI assistant launcher, global search, then the user menu. The user
 * menu's avatar now carries the notifications (a tabbed panel + unread badge),
 * so there's no separate bell — that frees the slot for the assistant without
 * crowding the bar.
 *
 * Server component on purpose : the client islands are the launcher, search,
 * drawer, and user menu. `brandedLogoData` is resolved once by the shared
 * `(authed)/layout` (which also feeds the NavRail) and passed in.
 */
export function AppBar({ brandedLogoData }: { brandedLogoData: BrandedAppLogoData }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/70">
      <div className="flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {/* Merged brand + drawer trigger (mobile only; the desktop NavRail
              carries the brand). Opens the primary-nav drawer, which now lists
              "Home" as its first item. */}
          <PrimaryNavMenu brandedLogoData={brandedLogoData} />
          <AppBarBreadcrumb />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <ChatLauncherButton />
            <GlobalSearchIconButton />
          </div>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
