"use client";

import type { ReactNode } from "react";

/**
 * Horizontal scroller that lays the board's columns out side by side and fills
 * the available height. Columns sit flush (no gap) and flat on the board
 * background, separated by their own divider borders. The web layer drops
 * `BoardColumn`s (and an optional "add column" affordance) in as children.
 */
export function BoardArea({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden border-t border-border">
      {children}
    </div>
  );
}
