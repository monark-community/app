"use client";

import { useEffect, useState } from "react";

// Anything at or below this *screen* width gets the full-screen panel treatment
// (mirrors Tailwind's `md`). Above it, a right-side panel.
const MOBILE_MAX_WIDTH = 767;

/**
 * The current *screen* width in CSS px, read from `visualViewport.width` (the
 * actual visible viewport) rather than a media query / `innerWidth`, which
 * report the **layout viewport** (ICB).
 *
 * That distinction is load-bearing on iOS. If the layout viewport blows out
 * past the screen for even a moment — a transient during panel open, a wide
 * child painting before its `overflow` clips it — `innerWidth` / `matchMedia`
 * grow with it while `visualViewport.width` stays pinned to the real screen.
 * A panel that reads this can't be corrupted by a blow-out (and thus can't
 * *lock in* the wrong variant — see {@link usePanelIsMobile}).
 */
export function readScreenWidth(): number | null {
  if (typeof window === "undefined") return null;
  return Math.round(window.visualViewport?.width ?? window.innerWidth);
}

export function useScreenWidth(): number | null {
  const [width, setWidth] = useState<number | null>(readScreenWidth);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setWidth(readScreenWidth());
    update();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return width;
}

/**
 * Mobile check for a Sheet-based detail panel, correct on the *first client
 * render* (the panel is a client-only portal, never in the SSR HTML, so reading
 * the viewport in the lazy initializer above can't cause a hydration mismatch).
 * It matters because a deep link (`?card=<id>`) opens the panel on the first
 * render : a stale value would pick the right-side `slide-in-from-right`
 * variant, which paints off-screen on a phone and blows the layout viewport
 * out. Worse, a media-query check would then *read that blown layout viewport*
 * as "desktop", lock the transform variant in, and never recover (the "pinch to
 * see the whole width" bug). Driving the decision off the visual-viewport width
 * breaks the feedback loop : the panel stays on the transform-free `full`
 * variant.
 *
 * `null` (SSR / no window yet) reads as desktop — the panel isn't painted on
 * the server anyway, and the first client value resolves synchronously.
 */
export function usePanelIsMobile(width: number | null): boolean {
  return width != null && width <= MOBILE_MAX_WIDTH;
}
