import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SidebarRail } from "@/components/sidebar-rail";

type PageLayoutProps = {
  /**
   * Secondary nav rail in cols 1–2 (xl+). When omitted, the slot
   * collapses but the grid still pre-allocates those columns so the
   * content stays viewport-centered. Pass a client component when the
   * nav needs interactive state (e.g. URL-driven tab switching).
   */
  sidebar?: ReactNode;
  /**
   * Future contextual rail in cols 11–12 (xl+). Same centering
   * guarantee: even when omitted, the slot keeps the content
   * page-centered. Wire up activity feeds, related links, etc. here
   * once the surfaces exist.
   */
  rightRail?: ReactNode;
  /** Main content ; renders in cols 3–10 of the grid. */
  children: ReactNode;
};

/**
 * The single layout authenticated pages reach for.
 *
 * On `xl+`: rails dock to the viewport edges. The sidebar pins
 * to `left:0` directly under the AppBar (`top:14` = `3.5rem`),
 * full viewport height, with a `border-r` separator. The right
 * rail mirrors on the right (when supplied). Both are
 * `position: fixed`, so they're outside the document flow.
 *
 * The content box reserves each present rail's width (`xl:pl-72` /
 * `xl:pr-72`), so `mx-auto` centers the content in the region
 * *between* the rails rather than on the whole viewport. Without
 * this the content floats at the viewport centre with a fixed rail
 * sitting in the gutter — an off-centre look, and any full-bleed
 * hero (see `UserBanner`) would spill under the rail. A page with
 * no rails keeps its content viewport-centred (both paddings off).
 *
 * Below `xl`: rails are hidden ; the content takes the full row
 * with the same `mx-auto max-w-2xl` cap. (The same nav data is
 * typically rendered as a horizontal strip inside the content
 * slot ; that's the page's responsibility, not the layout's.)
 *
 * Sidebar slot is `w-72` so it matches the primary-nav popover
 * exactly — the two surfaces have pixel-identical horizontal
 * extent and the only difference is delivery (this one in-flow
 * docked vs the popover overlay).
 *
 * The `xl` breakpoint (1280px) was picked because it's the
 * narrowest where the centered `max-w-2xl` content (672px) +
 * `w-72` sidebar (288px) leave room without overlap: at 1280px,
 * content's left edge sits at `(1280-672)/2 = 304px`, while the
 * sidebar's right edge sits at `288px` ; ~16px of breathing room
 * to spare.
 */
export function PageLayout({ sidebar, rightRail, children }: PageLayoutProps) {
  return (
    <>
      {sidebar && <SidebarRail>{sidebar}</SidebarRail>}

      <div className={cn(sidebar && "xl:pl-72", rightRail && "xl:pr-72")}>
        <div className="mx-auto w-full max-w-2xl space-y-6">{children}</div>
      </div>

      {rightRail && <SidebarRail side="right">{rightRail}</SidebarRail>}
    </>
  );
}
