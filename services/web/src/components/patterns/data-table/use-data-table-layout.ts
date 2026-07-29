"use client";

import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import type { ColumnSizingState, SortingState, VisibilityState } from "@tanstack/react-table";

/**
 * The persisted, user-adjustable layout of a {@link DataTable} : data-column
 * order, visibility, widths, and the sort priority list. Owned by
 * {@link useDataTableLayout} so the table and the toolbar controls
 * (`TableTools`) can share it ; persisted per-browser under `storageKey`.
 */
export interface DataTableLayout {
  /** Data-column ids in display order. May lag the live column set (columns
   *  added since the layout was saved) — reconcile with
   *  {@link reconcileColumnOrder} before use. */
  columnOrder: string[];
  setColumnOrder: Dispatch<SetStateAction<string[]>>;
  columnVisibility: VisibilityState;
  setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>;
  columnSizing: ColumnSizingState;
  setColumnSizing: Dispatch<SetStateAction<ColumnSizingState>>;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  /** Reverts the *column* layout (order / visibility / widths) to default.
   *  Leaves sorting alone — it has its own reset in the sorting panel. */
  reset: () => void;
  /** `true` when the column layout differs from default (reordered, a column
   *  hidden, or a width set) — i.e. there's something for `reset()` to clear.
   *  Gate the "Reset columns" control on this so it only shows when useful. */
  columnsModified: boolean;
  /** `false` until the persisted layout has loaded from localStorage (one
   *  tick after mount). Gate anything order/visibility-sensitive on this so
   *  it doesn't paint in the default layout and then jump. SSR-safe (starts
   *  `false` on server + first client paint). */
  hydrated: boolean;
}

type PersistedLayout = {
  columnOrder: string[];
  columnVisibility: VisibilityState;
  columnSizing: ColumnSizingState;
  sorting: SortingState;
};

/** Reconcile a stored data-column order against the current column set:
 *  keep known ids in their saved order, append any newly-added columns. */
export function reconcileColumnOrder(stored: string[], current: string[]): string[] {
  const set = new Set(current);
  const kept = stored.filter((id) => set.has(id));
  const appended = current.filter((id) => !kept.includes(id));
  return [...kept, ...appended];
}

/**
 * Owns a table's layout state + its localStorage persistence. Create it in
 * the screen component and pass the same object to `<DataTable layout>` and
 * `<TableTools layout>` so the toolbar controls drive the table.
 */
export function useDataTableLayout(storageKey: string): DataTableLayout {
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted layout after mount (client-only, avoids an SSR mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const p = JSON.parse(raw) as Partial<PersistedLayout>;
        if (Array.isArray(p.columnOrder)) setColumnOrder(p.columnOrder);
        if (p.columnVisibility) setColumnVisibility(p.columnVisibility);
        if (p.columnSizing) setColumnSizing(p.columnSizing);
        if (Array.isArray(p.sorting)) setSorting(p.sorting);
      }
    } catch {
      // ignore corrupt / unavailable storage
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    const layout: PersistedLayout = { columnOrder, columnVisibility, columnSizing, sorting };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      // ignore
    }
  }, [hydrated, storageKey, columnOrder, columnVisibility, columnSizing, sorting]);

  // Column-only reset (sorting keeps its own reset). Just clears the three
  // column dimensions ; the persistence effect re-saves the layout with the
  // current sorting preserved.
  function reset() {
    setColumnOrder([]);
    setColumnVisibility({});
    setColumnSizing({});
  }

  const columnsModified =
    columnOrder.length > 0 ||
    Object.values(columnVisibility).some((v) => v === false) ||
    Object.keys(columnSizing).length > 0;

  return {
    columnOrder,
    setColumnOrder,
    columnVisibility,
    setColumnVisibility,
    columnSizing,
    setColumnSizing,
    sorting,
    setSorting,
    reset,
    columnsModified,
    hydrated,
  };
}
