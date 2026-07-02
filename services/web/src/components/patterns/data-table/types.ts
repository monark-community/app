import type { ComponentType, ReactNode } from "react";

/** Value a column sorts by. Dates are compared chronologically. */
export type SortAccessor<TData> = (row: TData) => string | number | Date | null | undefined;

/**
 * Makes a cell inline-editable. Only attach to non-computed values (a
 * stored field the user can rename) — never to derived / relational
 * cells. `onSave` fires with the trimmed value only when it actually
 * changed ; the caller runs the update mutation.
 */
export interface CellEdit<TData> {
  getValue: (row: TData) => string;
  onSave: (row: TData, value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

/**
 * The mandatory first column. It is pinned left, cannot be hidden or
 * reordered, and renders a main label with optional subtext. When `href`
 * is set the label is a link (e.g. opening the detail panel) ; otherwise
 * `onSelect` makes it a button.
 */
export interface PrimaryColumnDef<TData> {
  header: string;
  label: (row: TData) => ReactNode;
  subtext?: (row: TData) => ReactNode;
  /** Optional leading visual (avatar, logo, status dot) rendered left of
   *  the label + subtext, so a row reads like the older card lists. */
  leading?: (row: TData) => ReactNode;
  /** Renders the label as a link to this href. Takes precedence over onSelect. */
  href?: (row: TData) => string | undefined;
  /** Called when the open-panel icon is clicked, if no href is given. */
  onSelect?: (row: TData) => void;
  /** When set, the label is inline-editable (e.g. rename in place). The
   *  detail panel is then opened via the hover icon, not the label. */
  edit?: CellEdit<TData>;
  enableSorting?: boolean;
  sortAccessor?: SortAccessor<TData>;
  size?: number;
  minSize?: number;
}

/** A regular, reorderable / hideable / resizable column. */
export interface DataColumnDef<TData> {
  id: string;
  header: string;
  cell: (row: TData) => ReactNode;
  /** When set, the cell is inline-editable ; `cell` still renders the
   *  read view, editing swaps in a text input. */
  edit?: CellEdit<TData>;
  enableSorting?: boolean;
  sortAccessor?: SortAccessor<TData>;
  /** Default true. The primary + actions columns are always false. */
  enableHiding?: boolean;
  align?: "left" | "right";
  size?: number;
  minSize?: number;
}

/** One entry in a row's `…` actions menu. */
export interface RowAction<TData> {
  label: string;
  onSelect: (row: TData) => void;
  icon?: ComponentType<{ className?: string }>;
  destructive?: boolean;
  /** Draw a divider above this item (e.g. before a destructive action). */
  separatorBefore?: boolean;
  disabled?: boolean;
}

/** Translated chrome text (kept out of the component per the i18n rule). */
export interface DataTableLabels {
  /** Column-visibility menu trigger + heading. */
  columns: string;
  /** Reset-layout action. */
  reset: string;
  /** aria-label for a row's `…` actions button. */
  rowActions: string;
  /** aria-label for the primary column's hover "open detail panel" icon. */
  openPanel: string;
  /** Shown in place of the empty state when the list query errored. Optional
   *  so screens can opt in ; provide alongside `isError` on the table. */
  errorTitle?: string;
  /** Label for the retry button in the error state. */
  retry?: string;
}

export interface DataTableProps<TData> {
  data: TData[];
  getRowId: (row: TData) => string;
  primaryColumn: PrimaryColumnDef<TData>;
  columns: DataColumnDef<TData>[];
  /** When provided, each row gets a trailing `…` menu built from this. */
  rowActions?: (row: TData) => RowAction<TData>[];
  /** localStorage key for persisting column order / visibility / widths / sort. */
  storageKey: string;
  labels: DataTableLabels;
  /** Highlights the row with this id (detail-panel selection). */
  selectedRowId?: string | null;
  isLoading?: boolean;
  /** When true (and there is no data to keep showing), the table renders an
   *  error state with a retry button instead of the empty state, so a failed
   *  fetch doesn't masquerade as "no rows". */
  isError?: boolean;
  /** Retry handler for the error state (typically `() => query.refetch()`). */
  onRetry?: () => void;
  skeletonRows?: number;
  emptyState?: ReactNode;
  className?: string;
  /**
   * Header chrome density. `"calm"` (default) keeps the table quiet : the
   * idle sort glyph and the column-layout menu stay hidden until you hover
   * the table / a header, so a simple list reads like the older card rows.
   * `"full"` always shows the sort affordances + a labelled columns button.
   */
  chrome?: "calm" | "full";
}
