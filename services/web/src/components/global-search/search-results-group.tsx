"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CommandGroup, CommandItem } from "@/components/ui/command";

/**
 * True only once `active` has stayed true continuously for `delayMs`. Flips
 * back to false the instant `active` clears. Gates the "Searching…" row so a
 * fast response never flashes it.
 */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) {
      setElapsed(false);
      return;
    }
    const id = setTimeout(() => setElapsed(true), delayMs);
    return () => clearTimeout(id);
  }, [active, delayMs]);
  return active && elapsed;
}

/**
 * The consistent shell every content provider renders its results into : a
 * labelled command group with one loading + empty policy. The whole group
 * (heading included) is suppressed when empty, and a single "Searching…" row
 * appears only once a fetch is both in flight and slow (> 400ms) with nothing
 * to show yet — so most (sub-threshold) loads resolve before it would flash.
 */
export function SearchResultsGroup({
  heading,
  loading,
  count,
  children,
}: {
  heading: string;
  loading: boolean;
  count: number;
  children: ReactNode;
}) {
  const t = useTranslations("globalSearch");
  const showSearching = useDelayedFlag(loading, 400) && count === 0;
  if (count === 0 && !showSearching) return null;
  return (
    <CommandGroup heading={heading}>
      {showSearching && (
        <CommandItem value="__loading" disabled>
          {t("searching")}
        </CommandItem>
      )}
      {children}
    </CommandGroup>
  );
}
