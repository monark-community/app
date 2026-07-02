"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import NProgress from "nprogress";

// Configure once on module load. `showSpinner: false` removes the
// upper-right spinner — we only want the top bar. Trickle / minimum
// values feel snappy without "stalling" on fast routes.
NProgress.configure({
  showSpinner: false,
  trickleSpeed: 200,
  minimum: 0.08,
});

/**
 * Top-of-viewport progress bar that fires on internal Next link clicks
 * and finishes when the destination pathname/search resolves.
 *
 * App Router doesn't expose router events the way pages-router did, so
 * this component listens for clicks on real `<a>` tags. Programmatic
 * `router.push` / `router.replace` calls bypass it ; that's a known
 * limitation, and the cases we have today (sign-out form action,
 * notification mark-as-read mutations, etc.) don't navigate cross-
 * route, so the gap doesn't matter in practice.
 *
 * Intended to be mounted once at the root layout. CSS overrides for
 * the bar colour live in `globals.css` so the bar uses the brand
 * orange instead of NProgress's default blue.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Wrap-up. Re-runs on every nav landing ; harmless when no bar is
  // active (NProgress.done is a no-op in that case).
  useEffect(() => {
    NProgress.done();
  }, [pathname, searchParams]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Modifier / non-primary clicks: don't intercept ; the user is
      // intentionally opening the link in a new context.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        // Same-page link (e.g. fragment or identical pathname) ; no
        // route load happens, so don't show the bar.
        if (url.pathname === window.location.pathname && url.search === window.location.search) {
          return;
        }
        NProgress.start();
      } catch {
        // Malformed href ; let the browser handle it.
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
