"use client";

import { useEffect, useState } from "react";

// Mobile breakpoint mirrors Tailwind's default `md` (768px). Anything below is
// treated as "mobile" — the calendar collapses to a single-day, touch-first layout.
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * SSR-safe viewport check. Starts `false` on the server / first paint and settles
 * on mount, then stays in sync with viewport changes via `matchMedia`.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}
