"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AdminSidebar } from "./admin-sidebar";

// The mobile / narrow-viewport secondary nav. It sticks just under the
// `h-14` AppBar (top-14), then plays the "hide on scroll down, reveal on
// scroll up" trick so the tabs stay reachable without permanently eating
// vertical space. On xl+ this is hidden and the vertical rail takes over.
//
// When hidden we translate the bar fully above the AppBar's bottom edge
// (its own height + the 3.5rem bar offset) so it tucks completely out of
// sight rather than peeking through the AppBar's translucent background.
export function AdminTabsBar() {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    const onScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;

      // Near the top there is nothing to hide behind ; always show.
      if (currentY < 56) {
        setHidden(false);
        lastScrollY.current = currentY;
        return;
      }

      // Ignore sub-pixel jitter and momentum wobble.
      if (Math.abs(delta) < 6) return;

      setHidden(delta > 0);
      lastScrollY.current = currentY;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={cn(
        "sticky top-14 z-20 border-b border-border bg-background/95 px-4 py-1 backdrop-blur transition-transform duration-200 supports-backdrop-filter:bg-background/70 sm:px-6 xl:hidden",
        hidden && "-translate-y-[calc(100%+3.5rem)]",
      )}
    >
      <AdminSidebar orientation="horizontal" />
    </div>
  );
}
