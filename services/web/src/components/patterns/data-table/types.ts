import type { ComponentType, ReactNode } from "react";
import type { RowData } from "@tanstack/react-table";
import type { DataTableLayout } from "./use-data-table-layout";

/** Icon rendered before a column header label — sized by the table. */
export type HeaderIcon = ComponentType<{ className?: string }>;

// Carry the optional header icon through TanStack's per-column `meta` so the
// header renderer can read it back off `columnDef.meta`.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    headerIcon?: HeaderIcon;
  }
}

/** Column id of the mandatory pinned primary column. */
export const PRIMARY_COLUMN_ID = "__primary";
/** Column id of the trailing row-actions column. */
export const ACTIONS_COLUMN_ID = "__actions";

/** Value a column sorts by. Dates are compared chronologically. */
export type SortAccessor<TData> = (row: TData) => string | number | Date | null | undefined;

/**
 * The mandatory first column. It is pinned left, cannot be hidden or
 * reordered, and renders a main label with optional subtext. When `href`
 * is set the label is a link (e.g. opening the detail panel) ; otherwise
 * `onSelect` makes it a button.
 */
export interface PrimaryColumnDef<TData> {
  header: string;
  /** Field-type glyph shown before the header label. */
  headerIcon?: HeaderIcon;
  label: (row: TData) => ReactNode;
  subtext?: (row: TData) => ReactNode;
  /** Optional leading visual (avatar, logo, status dot) rendered left of
   *  the label + subtext, so a row reads like the older card lists. */
  leading?: (row: TData) => ReactNode;
  /** Renders the label as a link to this href, and a click anywhere in the
   *  row navigates there. Takes precedence over onSelect. */
  href?: (row: TData) => string | undefined;
  /** Called when the label — or anywhere in the row — is clicked, if no href
   *  is given. */
  onSelect?: (row: TData) => void;
  enableSorting?: boolean;
  sortAccessor?: SortAccessor<TData>;
  size?: number;
  minSize?: number;
}

/** A regular, reorderable / hideable / resizable column. */
export interface DataColumnDef<TData> {
  id: string;
  header: string;
  /** Field-type glyph shown before the header label. */
  headerIcon?: HeaderIcon;
  cell: (row: TData) => ReactNode;
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

/** Strings for the sorting editor (trigger, directions, empty state). */
export interface DataTableSortLabels {
  /** Trigger aria-label / submenu row + heading. */
  label: string;
  ascending: string;
  descending: string;
  /** Empty-state hint shown when nothing is sorted. */
  none: string;
  /** Heading for the "add another sort field" section. */
  addField: string;
  /** aria-label for a sort field's remove (×) button. */
  remove: string;
  /** Label for the "reset sorting" action (clears every sort field at once).
   *  Omit to hide it. */
  reset?: string;
}

/** Translated chrome text (kept out of the component per the i18n rule).
 *  Sorting / columns / filter strings live with `TableTools`, which owns
 *  those controls since they moved out of the table into the toolbar. */
export interface DataTableLabels {
  /** aria-label for a row's `…` actions button. */
  rowActions: string;
  /** Shown in place of the empty state when the list query errored. Optional
   *  so screens can opt in ; provide alongside `isError` on the table. */
  errorTitle?: string;
  /** Label for the retry button in the error state. */
  retry?: string;
}

/** Translated chrome for the pagination footer (kept out of the component
 *  per the i18n rule ; build these with `usePaginationLabels()`). */
export interface DataTablePaginationLabels {
  /** ICU string with `{from}`, `{to}`, `{total}` — e.g. "Showing {from}–{to} of {total}". */
  showing: string;
  /** Label preceding the page-size selector, e.g. "Rows per page". */
  rowsPerPage: string;
  /** Previous-page button aria-label / text. */
  previous: string;
  /** Next-page button aria-label / text. */
  next: string;
}

/** Props for the pagination footer, assembled by `usePaginatedList().getFooterProps`. */
export interface DataTablePaginationProps {
  /** Zero-based index of the current page (drives the "from" number). */
  pageIndex: number;
  /** Current page size. */
  pageSize: number;
  /** Number of rows on the current page (drives the "to" number). */
  pageCount: number;
  /** Total rows matching the filter, across all pages. */
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPageSize: (size: number) => void;
  /** Page-size choices ; defaults to the shared `PAGE_SIZE_OPTIONS`. */
  pageSizeOptions?: readonly number[];
  labels: DataTablePaginationLabels;
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
  /**
   * Shared layout state from {@link useDataTableLayout}. Pass the same object
   * to `TableTools` so the toolbar's sorting / columns controls drive this
   * table. When omitted the table manages (and persists) its layout privately
   * under `storageKey` — fine for embeds with no toolbar.
   */
  layout?: DataTableLayout;
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
  /** When provided, a pagination footer renders below the table. Build with
   *  {@link DataTablePaginationProps} via `usePaginatedList().getFooterProps`. */
  pagination?: DataTablePaginationProps;
  className?: string;
}
