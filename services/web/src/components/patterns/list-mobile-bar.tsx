"use client";

import { useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The consolidated **mobile** toolbar for a list screen (`md:hidden` — desktop
 * keeps its roomier {@link FilterBar} row untouched). It reduces the crowded
 * top-of-list controls to at most three targets :
 *
 *   `[ lead .......... ] [🔍] [⋯ options]`
 *
 * - `lead` — the default full-width control : a Views picker (data-model lists)
 *   or the search field itself (admin lists, which have no saved views). Grows
 *   to fill the row.
 * - `search` — an *optional* alternate control (the query / search field). When
 *   given, a 🔍 button appears and tapping it swaps the `lead` out for this
 *   field full-width (with an ✕ to collapse back) — so power search is one tap
 *   away without occupying the row by default. Omit it when `lead` is already
 *   the search field.
 * - `options` — the single ⋯ trigger (typically `TableTools mode="sheet"`),
 *   opening the full-screen Sort / Columns / Follow sheet.
 *
 * Presentational + text-free : the caller supplies the concrete nodes and the
 * already-translated `searchLabel` / `closeLabel` for the toggle affordances.
 */
export function ListMobileBar({
  lead,
  search,
  options,
  searchLabel,
  closeLabel,
  className,
}: {
  lead: ReactNode;
  search?: ReactNode;
  options?: ReactNode;
  /** aria-label for the 🔍 expand button (only used when `search` is given). */
  searchLabel?: string;
  /** aria-label for the ✕ collapse button (only used when `search` is given). */
  closeLabel?: string;
  className?: string;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const canSearch = search != null;

  return (
    <div className={cn("flex items-center gap-2 md:hidden", className)}>
      {canSearch && searchOpen ? (
        <>
          <div className="min-w-0 flex-1">{search}</div>
          <Button
            variant="outline"
            size="icon"
            aria-label={closeLabel}
            className="shrink-0"
            onClick={() => setSearchOpen(false)}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </>
      ) : (
        <>
          <div className="min-w-0 flex-1">{lead}</div>
          {canSearch && (
            <Button
              variant="outline"
              size="icon"
              aria-label={searchLabel}
              className="shrink-0"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4" aria-hidden />
            </Button>
          )}
          {options}
        </>
      )}
    </div>
  );
}
