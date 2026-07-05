"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DataSidebar } from "./data-sidebar";

// The mobile / narrow-viewport secondary nav for the Data section. It
// sticks just under the `h-14` AppBar (top-14), then plays the "hide on
// scroll down, reveal on scroll up" trick so the tabs stay reachable
// without permanently eating vertical space. On xl+ this is hidden and
// the vertical rail takes over. (Mirror of AdminTabsBar.)
export function DataTabsBar({ allowedIds }: { allowedIds: readonly string[] }) {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    const onScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;

      if (currentY < 56) {
        setHidden(false);
        lastScrollY.current = currentY;
        return;
      }

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
      <DataSidebar orientation="horizontal" allowedIds={allowedIds} />
    </div>
  );
}
