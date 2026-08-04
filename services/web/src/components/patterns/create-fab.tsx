"use client";

import type { ComponentType } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mobile-only floating action button for a list screen's primary "create"
 * action. On a phone the labelled Create button is lifted out of the crowded
 * toolbar and dropped here — a thumb-reachable circle pinned to the bottom-right
 * of the viewport — so the toolbar collapses to just the query + options.
 *
 * `md:hidden` on purpose : desktop keeps the labelled button in the toolbar's
 * actions slot (the FAB never shows there). The caller decides when to render it
 * — pass nothing / unmount it when a full-screen detail panel takes over, so it
 * never floats over the panel's own actions.
 *
 * Text-free like the other patterns : the caller passes an already-translated
 * `label` (used as the accessible name + tooltip).
 */
export function CreateFab({
  onClick,
  label,
  icon: Icon = Plus,
  className,
}: {
  onClick: () => void;
  /** Accessible name + tooltip (already translated). */
  label: string;
  /** Glyph shown in the button (defaults to a plus). */
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        // Pinned bottom-right, clear of the iOS home indicator via safe-area.
        "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}
