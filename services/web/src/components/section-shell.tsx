"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarRail } from "@/components/sidebar-rail";

export interface SectionDetailHeader {
  title: ReactNode;
  backHref: string;
  backLabel: string;
}

interface SectionShellContextValue {
  setDetailHeader: (header: SectionDetailHeader | null) => void;
}

const SectionShellContext = createContext<SectionShellContextValue | null>(null);

/**
 * Registers a detail page's back-affordance + title with the nearest
 * {@link SectionShell}, so it appears in the mobile scroll-linked chrome —
 * see the shell's doc for the swap behavior. Called by {@link PageHeader}
 * automatically whenever it's given a `backHref` ; not meant to be called
 * directly elsewhere. Pass `null` (or omit) to clear — a page without a
 * back link doesn't want a detail bar. No-ops outside a `SectionShell`
 * (e.g. a page rendered standalone in a test), so callers never need to
 * guard.
 */
export function useSectionDetailHeader(header: SectionDetailHeader | null): void {
  const ctx = useContext(SectionShellContext);
  const title = header?.title;
  const backHref = header?.backHref;
  const backLabel = header?.backLabel;
  useEffect(() => {
    if (!ctx) return;
    ctx.setDetailHeader(backHref ? { title, backHref, backLabel: backLabel ?? "" } : null);
    return () => ctx.setDetailHeader(null);
  }, [ctx, title, backHref, backLabel]);
}

const SCROLL_TOP_THRESHOLD = 56;
const SCROLL_JITTER_THRESHOLD = 6;

/**
 * The single shell every `(authed)/<section>/layout.tsx` mounts : the
 * viewport-bounded, single-scroll-region chrome (AppBar + secondary nav +
 * `<main>`), replacing what `admin`/`account`/`data` each used to hand-roll
 * separately (`PageLayout` + `SecondaryTabsBar` + a bespoke flex wrapper).
 *
 * **Why one scroll region.** `<body>` is globally `overflow-y-hidden` (the
 * "table pages scroll internally" work) — no page can rely on real window
 * scroll at any breakpoint, so the shell owns a `h-[calc(100dvh-57px)]
 * overflow-hidden` box with `<main>` as the one `overflow-y-auto` region.
 *
 * **The mobile nav / detail-bar swap.** Below `xl` (where the vertical
 * `SidebarRail` gives way to a horizontal strip), `secondaryNav` renders in
 * a row that collapses to zero height as the user scrolls `<main>` down
 * (via a `grid-template-rows` 1fr→0fr transition — animates smoothly and,
 * being real box height rather than a transform, naturally pushes
 * whatever's below it up to fill the gap) and expands back on scroll up
 * or near the top. When a detail page (e.g. a record editor) registers a
 * header via `useSectionDetailHeader` — done automatically by
 * {@link "@/components/page-header" | PageHeader} whenever it has a
 * `backHref` — that header renders as a compact row directly below the
 * (collapsible) nav row. The net effect : 3 stacked rows at rest (secondary
 * nav + the compact detail bar, both visible), collapsing to 2 as the nav
 * row shrinks away on scroll-down (the detail bar rises into the vacated
 * slot, always reachable), and back to 3 on scroll-up. Pages with no
 * registered detail header keep today's plain nav-hides-on-scroll behavior.
 *
 * `variant="centered"` reproduces the old `PageLayout`'s `max-w-2xl`
 * centered column (admin / account forms) ; `"full"` runs edge-to-edge
 * (the Data section's wide tables).
 */
export function SectionShell({
  sidebar,
  secondaryNav,
  variant = "centered",
  children,
}: {
  /** Desktop (`xl+`) vertical rail content, docked via `SidebarRail`. */
  sidebar?: ReactNode;
  /** Mobile (`<xl`) horizontal nav content — an `orientation="horizontal"` `Sidebar`. */
  secondaryNav?: ReactNode;
  variant?: "centered" | "full";
  children: ReactNode;
}) {
  const [detailHeader, setDetailHeader] = useState<SectionDetailHeader | null>(null);
  const [navHidden, setNavHidden] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const lastScrollTop = useRef(0);

  // Tracks `<main>`'s own scroll (not `window` — window can't scroll, see
  // the shell's doc) to drive the nav row's collapse. Mirrors the old
  // `SecondaryTabsBar`'s window-scroll logic exactly, just re-targeted at
  // the real scrolling element — batched to at most once per animation
  // frame via `requestAnimationFrame` : `scroll` can fire many times per
  // frame on some browsers/devices, and running the check (+ a potential
  // `setState`) on every single one competes with the browser's own
  // scroll-compositing work on the main thread, which is what made the
  // collapse feel laggy rather than tracking the gesture.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    lastScrollTop.current = el.scrollTop;
    let ticking = false;

    function process() {
      ticking = false;
      if (!el) return;
      const currentTop = el.scrollTop;
      const delta = currentTop - lastScrollTop.current;

      if (currentTop < SCROLL_TOP_THRESHOLD) {
        setNavHidden(false);
        lastScrollTop.current = currentTop;
        return;
      }
      if (Math.abs(delta) < SCROLL_JITTER_THRESHOLD) return;
      setNavHidden(delta > 0);
      lastScrollTop.current = currentTop;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(process);
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <SectionShellContext.Provider value={{ setDetailHeader }}>
      <div className="flex h-[calc(100dvh-57px)] flex-col overflow-hidden">
        {sidebar && <SidebarRail>{sidebar}</SidebarRail>}
        <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", sidebar && "xl:pl-72")}>
          {secondaryNav && (
            <div
              className={cn(
                // `ease-out` (fast start) reads as tracking the scroll gesture
                // immediately in both directions ; `ease-in-out`'s slow start
                // was what made the collapse feel like it lagged behind.
                "grid shrink-0 transition-[grid-template-rows] duration-150 ease-out xl:hidden",
                navHidden ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="border-b border-border bg-background/95 px-4 py-1 backdrop-blur supports-backdrop-filter:bg-background/70 sm:px-6">
                  {secondaryNav}
                </div>
              </div>
            </div>
          )}
          {detailHeader && (
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/70 sm:px-6 xl:hidden">
              <Link
                href={detailHeader.backHref}
                aria-label={detailHeader.backLabel}
                className="-ml-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
              </Link>
              <span className="truncate text-sm font-medium">{detailHeader.title}</span>
            </div>
          )}
          <main
            ref={mainRef}
            className={cn(
              // `overflow-x-hidden` is load-bearing, not decorative: a full-
              // bleed hero (e.g. `UserBanner` on `/account/profile`) sizes
              // itself off the raw viewport (`w-screen` / `50vw`), which
              // assumes it spans the true window width. Once `<main>`'s own
              // content is tall enough to need its `overflow-y-auto`
              // scrollbar, that scrollbar eats a few px of `<main>`'s content
              // box that the viewport-based bleed math doesn't know about,
              // so the hero overshoots by exactly the scrollbar's width.
              // Without this, that overshoot became a real horizontal
              // scrollbar (mixed `overflow-y: auto` / `overflow-x: visible`
              // computes the visible axis to `auto` too, per spec). Safe to
              // clip : the one thing that's supposed to be wider than
              // `<main>` (DataTable's tables) already scrolls in its own
              // internal `overflow-x-auto` wrapper, not by relying on this.
              "w-full min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-20 sm:px-6",
              // The detail bar already gives its own breathing room (padding +
              // border) below the AppBar, so `<main>` doesn't need any top
              // padding of its own on top of that — the collapsed PageHeader's
              // `space-y-6` gap to the first section is enough, matching the
              // same rhythm every other section-to-section gap on the page
              // already uses. Only on mobile, where the detail bar actually
              // renders ; `xl+` never shows it, so it keeps the standard
              // `pt-8` regardless of `detailHeader`.
              detailHeader ? "pt-0 xl:pt-8" : "pt-8",
            )}
          >
            <div
              className={variant === "centered" ? "mx-auto w-full max-w-2xl space-y-6" : "w-full"}
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </SectionShellContext.Provider>
  );
}
