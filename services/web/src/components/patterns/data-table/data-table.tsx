"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type Header,
  type RowSelectionState,
  type Updater,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical, MoreHorizontal } from "lucide-react";
import { DragHandle } from "@monark/components/ui/drag-handle";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ACTIONS_COLUMN_ID,
  PRIMARY_COLUMN_ID,
  SELECT_COLUMN_ID,
  type DataTableProps,
  type PrimaryColumnDef,
  type RowAction,
  type SortAccessor,
} from "./types";
import { reconcileColumnOrder, useDataTableLayout } from "./use-data-table-layout";
import { DataTablePagination } from "./pagination";

function normalizeSort(value: string | number | Date | null | undefined): string | number {
  if (value == null) return "";
  if (value instanceof Date) return value.getTime();
  return value;
}

function toAccessor<TData>(acc: SortAccessor<TData>) {
  return (row: TData) => normalizeSort(acc(row));
}

// The sticky actions header cell paints an opaque background so header cells
// scrolling under it (horizontal scroll) don't bleed through. The header row's
// tint is `bg-muted/30` over the `bg-background` thead ; reproduce it as an
// opaque composite. Muted is low-chroma, so this `color-mix` approximation of
// alpha-compositing is imperceptible here. (The body cells take a different,
// exact route — see the actions <td> — because a saturated selected tint would
// visibly diverge from a color-mix approximation.) Kept as a full literal
// string so Tailwind's scanner emits the arbitrary value.
const PINNED_HEADER_BG = "bg-[color-mix(in_srgb,var(--muted)_30%,var(--background))]";

/**
 * The standard list table. Renders rows only — the toolbar controls
 * (filters / sorting / column layout) live in `TableTools`, wired to the
 * same `useDataTableLayout` state. Headers still click-to-sort and
 * drag-to-reorder in place.
 */
export function DataTable<TData>({
  data,
  getRowId,
  primaryColumn,
  columns,
  rowActions,
  storageKey,
  layout: externalLayout,
  labels,
  selection,
  selectedRowId,
  isLoading = false,
  isError = false,
  onRetry,
  skeletonRows = 3,
  emptyState,
  pagination,
  fillParent = false,
  className,
}: DataTableProps<TData>) {
  const router = useRouter();

  // Standalone fallback so a table without toolbar controls still persists
  // its layout. Unused (but still mounted — rules of hooks) when the screen
  // passes a shared layout in.
  const internalLayout = useDataTableLayout(storageKey);
  const layout = externalLayout ?? internalLayout;

  const defaultDataOrder = useMemo(() => columns.map((c) => c.id), [columns]);
  const dataColumnOrder = useMemo(
    () => reconcileColumnOrder(layout.columnOrder, defaultDataOrder),
    [layout.columnOrder, defaultDataOrder],
  );

  const tableColumns = useMemo<ColumnDef<TData>[]>(() => {
    const selectDef: ColumnDef<TData>[] = selection
      ? [
          {
            id: SELECT_COLUMN_ID,
            enableHiding: false,
            enableSorting: false,
            enableResizing: false,
            size: 64,
            minSize: 64,
            header: ({ table }) => (
              <div className="flex items-center justify-center">
                <Checkbox
                  aria-label={labels.selectAll}
                  checked={table.getIsAllRowsSelected()}
                  indeterminate={table.getIsSomeRowsSelected()}
                  onChange={table.getToggleAllRowsSelectedHandler()}
                />
              </div>
            ),
            cell: ({ row }) => (
              // Stop the click here so the whole select cell toggles the row
              // rather than activating it (opening the record).
              <div
                className="flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  aria-label={labels.selectRow}
                  checked={row.getIsSelected()}
                  disabled={!row.getCanSelect()}
                  onChange={row.getToggleSelectedHandler()}
                />
              </div>
            ),
          },
        ]
      : [];

    const primaryDef: ColumnDef<TData> = {
      id: PRIMARY_COLUMN_ID,
      header: primaryColumn.header,
      meta: { headerIcon: primaryColumn.headerIcon },
      enableHiding: false,
      enableSorting: !!(primaryColumn.enableSorting && primaryColumn.sortAccessor),
      size: primaryColumn.size ?? 280,
      minSize: primaryColumn.minSize ?? 160,
      ...(primaryColumn.enableSorting && primaryColumn.sortAccessor
        ? { accessorFn: toAccessor(primaryColumn.sortAccessor) }
        : {}),
      cell: ({ row }) => <PrimaryCell row={row.original} def={primaryColumn} />,
    };

    const dataDefs: ColumnDef<TData>[] = columns.map((c) => ({
      id: c.id,
      header: c.header,
      meta: { headerIcon: c.headerIcon },
      enableHiding: c.enableHiding ?? true,
      enableSorting: !!(c.enableSorting && c.sortAccessor),
      size: c.size ?? 160,
      minSize: c.minSize ?? 80,
      ...(c.enableSorting && c.sortAccessor ? { accessorFn: toAccessor(c.sortAccessor) } : {}),
      cell: ({ row }) => (
        <div className={cn("truncate", c.align === "right" && "text-right")}>
          {c.cell(row.original)}
        </div>
      ),
    }));

    const actionsDef: ColumnDef<TData>[] = rowActions
      ? [
          {
            id: ACTIONS_COLUMN_ID,
            header: "",
            enableHiding: false,
            enableSorting: false,
            enableResizing: false,
            size: 56,
            minSize: 56,
            cell: ({ row }) => (
              <div className="flex justify-end">
                <RowActionsMenu
                  row={row.original}
                  actions={rowActions(row.original)}
                  label={labels.rowActions}
                />
              </div>
            ),
          },
        ]
      : [];

    return [...selectDef, primaryDef, ...dataDefs, ...actionsDef];
  }, [
    selection,
    primaryColumn,
    columns,
    rowActions,
    labels.rowActions,
    labels.selectRow,
    labels.selectAll,
  ]);

  const columnOrder = useMemo(
    () => [
      ...(selection ? [SELECT_COLUMN_ID] : []),
      PRIMARY_COLUMN_ID,
      ...dataColumnOrder,
      ...(rowActions ? [ACTIONS_COLUMN_ID] : []),
    ],
    [selection, dataColumnOrder, rowActions],
  );

  // TanStack row selection ⇄ the caller's `Set<id>`. Derived each render from
  // the incoming set ; changes convert back to a set for the caller.
  const rowSelection = useMemo<RowSelectionState>(() => {
    if (!selection) return {};
    const state: RowSelectionState = {};
    for (const id of selection.selectedIds) state[id] = true;
    return state;
  }, [selection]);

  function handleRowSelectionChange(updater: Updater<RowSelectionState>) {
    if (!selection) return;
    const next = typeof updater === "function" ? updater(rowSelection) : updater;
    selection.onSelectedIdsChange(new Set(Object.keys(next).filter((id) => next[id])));
  }

  const table = useReactTable({
    data,
    columns: tableColumns,
    getRowId: (row) => getRowId(row),
    state: {
      columnOrder,
      columnVisibility: layout.columnVisibility,
      columnSizing: layout.columnSizing,
      sorting: layout.sorting,
      rowSelection,
    },
    enableRowSelection: !!selection,
    onRowSelectionChange: handleRowSelectionChange,
    onColumnVisibilityChange: layout.setColumnVisibility,
    onColumnSizingChange: layout.setColumnSizing,
    onSortingChange: layout.setSorting,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    defaultColumn: { minSize: 80 },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Reorder against the reconciled order (a stale stored order may be
    // missing recently-added column ids).
    const from = dataColumnOrder.indexOf(String(active.id));
    const to = dataColumnOrder.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    layout.setColumnOrder(arrayMove(dataColumnOrder, from, to));
  }

  const rows = table.getRowModel().rows;

  // Own first-paint gate, independent of `layout.hydrated`. A bare mount
  // effect always runs on the first post-paint commit, so this reliably flips
  // even if the layout lives in a parent whose hydration flag never reaches us
  // (a suspended / memoized parent, a remount race). It is the escape hatch
  // that guarantees the table can't get *stuck* in the skeleton.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Keep the whole table in a skeleton until the persisted column layout has
  // resolved — otherwise headers + rows paint in the default order/visibility
  // and then jump when localStorage loads. In the normal path `layout.hydrated`
  // and `mounted` flip in the same batched re-render, so the first non-skeleton
  // paint already has the resolved order (no flash). `mounted` alone is enough
  // to leave the skeleton, so a stuck hydration flag can never wedge it.
  const configResolved = layout.hydrated || mounted;
  const showSkeleton = isLoading || !configResolved;

  // Sticky headers need the table to be its own vertical scroll container
  // (the `overflow-x` wrapper already makes it a scroll container, but with
  // no height cap it just scrolls with the page and the sticky `thead` rides
  // along).
  //
  // Two ways to get that bounded height:
  //   - `fillParent` (deterministic): an ancestor already caps the height (a
  //     viewport-height flex shell), so the table just takes `h-full` and
  //     scrolls internally. No measurement, no scroll-vs-cap races.
  //   - default (self-measuring): cap the table+footer region to the space
  //     between its top and the viewport bottom, for pages that scroll at the
  //     window level. Falls back to unbounded (page scroll) on short viewports.
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  useEffect(() => {
    if (fillParent) return; // parent owns the height — nothing to measure
    const el = containerRef.current;
    if (!el || typeof window === "undefined") return;
    const BOTTOM_GAP = 16;
    // Below this the cap would leave too little room to be useful, so we let
    // the page scroll instead (short viewports, a very tall header above).
    const MIN_USEFUL_HEIGHT = 200;
    // The padded scroll region the table lives in (its `pb-*` is the trailing
    // space we must reserve). Resolved once — its identity doesn't change.
    const region = el.closest("main");
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const docTop = rect.top + window.scrollY;
      // Space below the table that lives in the page flow and would otherwise
      // push it past the viewport — the scroll region's bottom padding plus any
      // siblings below the table. Reserving it stops the capped table from
      // handing the page its own scrollbar next to the table's (a blank strip
      // under a table that otherwise fits — the double-scroll symptom).
      //
      // Computed from box *positions* (`region.bottom − table.bottom`), NOT
      // from `documentElement.scrollHeight` : scrollHeight clamps up to the
      // viewport height once the content fits, so it would report the reserved
      // gap back as more trailing space and the cap would shrink on every pass
      // (runaway flicker). Box positions don't clamp — capping the table moves
      // the region's bottom and the table's bottom by the same delta, so this
      // value is invariant under the cap and the measurement settles at once.
      const regionBottom = (region ?? document.body).getBoundingClientRect().bottom;
      const trailing = Math.max(0, regionBottom - rect.bottom);
      const avail = window.innerHeight - docTop - trailing - BOTTOM_GAP;
      // Floor so re-measures that resolve to the same integer bail out of the
      // state update (React `Object.is`) — a second guard against feedback.
      setMaxHeight(avail > MIN_USEFUL_HEIGHT ? Math.floor(avail) : null);
    };

    // Measure now, then again next frame so late layout — a font swap, the
    // toolbar wrapping, an async page header hydrating — can't leave us pinned
    // to a stale measurement.
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);

    // A one-shot mount measurement goes stale the instant the content around
    // the table reflows (a bulk-edit bar sliding in, the filter row wrapping,
    // a header hydrating) — `docTop` or the trailing space shifts, the cap no
    // longer reaches the viewport bottom, and the page silently regains its
    // own scrollbar. Observing `<main>` (the scrolling region) re-measures on
    // every such change. Capping the table only changes content *below* its
    // top, leaving both `docTop` and the trailing space unchanged on that
    // pass, so the flooring bail stops any feedback loop.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => measure());
      observer.observe(region ?? document.body);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [fillParent]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex w-full min-w-0 flex-col",
        // Deterministic mode: fill the (bounded) parent — but only at the app's
        // desktop breakpoint (`xl`), where the Data shell is a bounded
        // viewport-height flex column. Below `xl` the table keeps its natural
        // height and the page scrolls, so the tab bar's hide-on-scroll and the
        // mobile URL-bar collapse keep working (and `flex-1` can't collapse to
        // zero against an unbounded mobile parent). Self-measuring mode: the
        // `maxHeight` style below caps it against the viewport.
        fillParent && "xl:h-full xl:min-h-0",
        className,
      )}
      style={fillParent ? undefined : { maxHeight: maxHeight ?? undefined }}
    >
      <div
        className={cn(
          fillParent
            ? // Desktop: internal vertical scroll under the pinned header.
              // Mobile: natural height (horizontal scroll only for wide tables),
              // so the page owns the vertical scroll.
              "overflow-x-auto xl:min-h-0 xl:flex-1 xl:overflow-y-auto"
            : "min-h-0 flex-1 overflow-auto",
        )}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="min-w-full table-fixed text-sm" style={{ width: table.getTotalSize() }}>
            {/* `bg-background` (opaque) sits behind the header's translucent
                `bg-muted/30` tint so body rows can't show through as they
                scroll under the pinned header. */}
            <thead className="sticky top-0 z-20 border-b border-border bg-background">
              {!configResolved ? (
                // Skeleton headers until the column config resolves, so they
                // never flash in the default order then reorder.
                <tr className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {table.getVisibleLeafColumns().map((col) =>
                    col.id === ACTIONS_COLUMN_ID ? (
                      <Fragment key={col.id}>
                        <th aria-hidden className="p-0" />
                        <th className="h-9 px-4" style={{ width: col.getSize() }} />
                      </Fragment>
                    ) : (
                      <th key={col.id} className="h-9 px-4" style={{ width: col.getSize() }}>
                        <Skeleton className="h-3 w-16 max-w-full" />
                      </th>
                    ),
                  )}
                  {!rowActions && <th aria-hidden className="p-0" />}
                </tr>
              ) : (
                table.getHeaderGroups().map((headerGroup) => (
                  <tr
                    key={headerGroup.id}
                    className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    <SortableContext
                      items={dataColumnOrder}
                      strategy={horizontalListSortingStrategy}
                    >
                      {headerGroup.headers.map((header) => {
                        // The selection column renders its own checkbox header
                        // (no sort/drag/label chrome).
                        if (header.column.id === SELECT_COLUMN_ID) {
                          return (
                            <th
                              key={header.id}
                              className="h-9 px-2"
                              style={{ width: header.getSize() }}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </th>
                          );
                        }
                        // The pinned actions header, with the slack absorber
                        // rendered immediately to its left so the `…` column
                        // stays flush with the container's right edge even when
                        // the table doesn't overflow (see the spacer note below).
                        if (header.column.id === ACTIONS_COLUMN_ID) {
                          return (
                            <Fragment key={header.id}>
                              <th aria-hidden className="p-0" />
                              <StaticHeader header={header} pinnedRight />
                            </Fragment>
                          );
                        }
                        const isReorderable = header.column.id !== PRIMARY_COLUMN_ID;
                        return isReorderable ? (
                          <SortableHeader key={header.id} header={header} />
                        ) : (
                          <StaticHeader key={header.id} header={header} />
                        );
                      })}
                    </SortableContext>
                    {/* Slack absorber : the sole auto-width column, so the fixed
                        columns (select / actions) and resized data columns keep
                        their exact widths instead of `table-fixed` scaling every
                        column up. With an actions column it renders just left of
                        the pinned `…` (above) so that stays flush-right ; without
                        one it trails here. */}
                    {!rowActions && <th aria-hidden className="p-0" />}
                  </tr>
                ))
              )}
            </thead>
            <tbody>
              {showSkeleton &&
                Array.from({ length: skeletonRows }).map((_, r) => (
                  <tr key={r} className="border-t border-border">
                    {table.getVisibleLeafColumns().map((col) =>
                      col.id === ACTIONS_COLUMN_ID ? (
                        <Fragment key={col.id}>
                          <td aria-hidden className="p-0" />
                          <td className="px-4 py-3" style={{ width: col.getSize() }} />
                        </Fragment>
                      ) : (
                        <td key={col.id} className="px-4 py-3">
                          <Skeleton className="h-4 w-full max-w-32" />
                        </td>
                      ),
                    )}
                    {!rowActions && <td aria-hidden className="p-0" />}
                  </tr>
                ))}

              {!showSkeleton &&
                rows.map((row) => {
                  const isSelected = selectedRowId != null && row.id === selectedRowId;
                  // The whole row activates the primary column (open the detail
                  // panel / navigate), so clicking anywhere behaves like clicking
                  // the primary label. Only when the primary is actually
                  // actionable for this row (a link href or an onSelect).
                  const rowHref = primaryColumn.href?.(row.original);
                  const canActivate = !!rowHref || !!primaryColumn.onSelect;
                  return (
                    <tr
                      key={row.id}
                      onClick={
                        canActivate
                          ? (e) => {
                              // Let a real interactive control inside the row own
                              // its own click (the primary link, the row-actions
                              // button, inline links / inputs), and don't hijack a
                              // text selection drag.
                              if (
                                (e.target as Element).closest(
                                  "a, button, input, select, textarea, [role='button'], [role='menuitem']",
                                )
                              ) {
                                return;
                              }
                              if (window.getSelection()?.toString()) return;
                              if (rowHref) router.push(rowHref);
                              else primaryColumn.onSelect?.(row.original);
                            }
                          : undefined
                      }
                      className={cn(
                        // `group/row` drives the pinned actions cell's own
                        // hover background (it can't reuse the row's translucent
                        // tint — see PINNED_ACTIONS_BG).
                        "group/row border-t border-border transition-colors",
                        canActivate && "cursor-pointer",
                        isSelected
                          ? "bg-primary/10 ring-1 ring-inset ring-primary"
                          : "hover:bg-muted/30",
                      )}
                    >
                      {row.getVisibleCells().map((cell) => {
                        // Pin the row-actions column to the right edge so the `…`
                        // menu is always flush-right and stays visible during
                        // horizontal scroll, instead of trailing after the last
                        // data column. The slack absorber renders just to its left
                        // so it's flush even when the table doesn't overflow ;
                        // `bg-inherit` picks up the row's (opaque) background so
                        // cells scrolling under it don't show through.
                        if (cell.column.id === ACTIONS_COLUMN_ID) {
                          return (
                            <Fragment key={cell.id}>
                              <td aria-hidden className="p-0" />
                              <td
                                className="sticky right-0 z-10 bg-background align-middle"
                                style={{ width: cell.column.getSize() }}
                              >
                                {/* Opaque `bg-background` base blocks cells
                                    scrolling under it ; the row's real translucent
                                    tint is layered on top as an absolute fill, so
                                    the pinned cell shows EXACTLY what a transparent
                                    sibling shows (tint over the page background) —
                                    no color-mix approximation, so a saturated
                                    selected `bg-primary/10` matches precisely. */}
                                <div
                                  aria-hidden
                                  className={cn(
                                    "pointer-events-none absolute inset-0",
                                    isSelected ? "bg-primary/10" : "group-hover/row:bg-muted/30",
                                  )}
                                />
                                <div className="relative px-4 py-3">
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </div>
                              </td>
                            </Fragment>
                          );
                        }
                        return (
                          <td
                            key={cell.id}
                            className="px-4 py-3 align-middle"
                            style={{ width: cell.column.getSize() }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                      {!rowActions && <td aria-hidden className="p-0" />}
                    </tr>
                  );
                })}
            </tbody>
          </table>

          {/* Empty / error state lives OUTSIDE the table so it centers on the
              scroll container, not the (possibly overflowing) table width.
              `sticky left-0` + `w-full` pins it to the visible area and sizes
              it to the viewport, so it stays centered even when wide columns
              force horizontal scroll. */}
          {!showSkeleton && rows.length === 0 && (
            <div className="sticky left-0 w-full px-4 py-10 text-center text-sm text-muted-foreground">
              {isError ? (
                <div className="flex flex-col items-center gap-3">
                  <p>{labels.errorTitle}</p>
                  {onRetry && labels.retry && (
                    <Button variant="outline" size="sm" onClick={onRetry}>
                      {labels.retry}
                    </Button>
                  )}
                </div>
              ) : (
                emptyState
              )}
            </div>
          )}
        </DndContext>
      </div>

      {pagination && !showSkeleton && (
        <DataTablePagination
          {...pagination}
          // Freeze paging while a fetch is in flight so a fast double-click
          // can't skip a page (keepPreviousData keeps the old nextCursor).
          canPrev={pagination.canPrev && !isLoading}
          canNext={pagination.canNext && !isLoading}
        />
      )}
    </div>
  );
}

/** Header for the pinned primary / actions columns: sortable-by-click if
 *  the column allows it, resizable, but never draggable. */
function StaticHeader<TData>({
  header,
  pinnedRight,
}: {
  header: Header<TData, unknown>;
  /** Pin to the right edge (the actions column) so its header stays aligned
   *  with the sticky `…` cells and above other headers on horizontal scroll. */
  pinnedRight?: boolean;
}) {
  return (
    <th
      className={cn(
        "group/th relative h-9 px-4 font-medium",
        // Opaque composite matching the header row's translucent `bg-muted/30`
        // tint (so it reads identically to the other headers, not black/plain)
        // while staying opaque enough that cells don't bleed under it on scroll.
        pinnedRight && cn("sticky right-0 z-30", PINNED_HEADER_BG),
      )}
      style={{ width: header.getSize() }}
    >
      <HeaderLabel header={header} />
      <ResizeHandle header={header} />
    </th>
  );
}

/** Reorderable data-column header — drag to move, click to sort. */
function SortableHeader<TData>({ header }: { header: Header<TData, unknown> }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: header.column.id,
  });

  return (
    <th
      ref={setNodeRef}
      className={cn("group/th relative h-9 px-4 font-medium", isDragging && "z-10 opacity-70")}
      style={{
        width: header.getSize(),
        transform: CSS.Translate.toString(transform),
        transition,
      }}
    >
      {/* Reorder affordance : a grip that fades in on hover / focus so a
          data-column header reads as draggable, not just cursor-pointer.
          Purely indicative — the whole HeaderLabel owns the dnd listeners —
          so it stays pointer-events-none + aria-hidden and sits in the left
          padding gutter, where it can't shift the header text out of line
          with the body cells below. */}
      <GripVertical
        aria-hidden
        className="pointer-events-none absolute left-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50 opacity-0 transition-opacity group-hover/th:opacity-100 group-focus-within/th:opacity-100"
      />
      <HeaderLabel header={header} dragAttributes={attributes} dragListeners={listeners} />
      <ResizeHandle header={header} />
    </th>
  );
}

function HeaderLabel<TData>({
  header,
  dragAttributes,
  dragListeners,
}: {
  header: Header<TData, unknown>;
  dragAttributes?: ReturnType<typeof useSortable>["attributes"];
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
}) {
  const canSort = header.column.getCanSort();
  const sorted = header.column.getIsSorted();
  // 1-based position in the multi-sort priority list, shown next to the
  // arrow so "sorted by Status, then Budget" is readable off the headers.
  // Only when 2+ sorts are stacked — a lone sort's arrow says it all.
  const sortIndex = header.column.getSortIndex();
  const multiSort = header.getContext().table.getState().sorting.length > 1;
  const content = flexRender(header.column.columnDef.header, header.getContext());
  const HeaderIcon = header.column.columnDef.meta?.headerIcon;

  return (
    <button
      type="button"
      {...dragAttributes}
      {...dragListeners}
      onClick={canSort ? (e) => header.column.getToggleSortingHandler()?.(e) : undefined}
      className={cn(
        "flex w-full items-center gap-1 truncate text-left uppercase",
        canSort || dragListeners ? "cursor-pointer" : "cursor-default",
      )}
    >
      {HeaderIcon && (
        <HeaderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
      )}
      <span className="truncate">{content}</span>
      {canSort &&
        (sorted ? (
          <span className="flex shrink-0 items-center" aria-hidden>
            {sorted === "asc" ? (
              <ArrowUp className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5 shrink-0" />
            )}
            {multiSort && (
              <span className="text-[10px] font-semibold leading-none tabular-nums text-muted-foreground">
                {sortIndex + 1}
              </span>
            )}
          </span>
        ) : (
          // Idle sort hint — hidden until the header is hovered, so a quiet
          // desktop table shows no per-column arrows. On touch (no hover) it
          // stays faintly visible so "tap to sort" is discoverable.
          <ArrowUpDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity pointer-coarse:opacity-100 group-hover/th:opacity-100"
            aria-hidden
          />
        ))}
    </button>
  );
}

function ResizeHandle<TData>({ header }: { header: Header<TData, unknown> }) {
  if (!header.column.getCanResize()) return null;
  return (
    <DragHandle
      orientation="vertical"
      active={header.column.getIsResizing()}
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      onClick={(e) => e.stopPropagation()}
      // Hidden on touch : a 6px drag strip is unusable with a finger and easy to
      // mis-tap next to the sort target ; column width is adjusted from the
      // toolbar Columns editor on mobile instead.
      className="absolute right-0 top-0 h-full w-1.5 pointer-coarse:hidden"
    />
  );
}

function PrimaryCell<TData>({ row, def }: { row: TData; def: PrimaryColumnDef<TData> }) {
  const label = def.label(row);
  const subtext = def.subtext?.(row);
  const leading = def.leading?.(row);
  const href = def.href?.(row);

  return (
    <div className="flex min-w-0 items-center gap-3">
      {leading != null && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        {href ? (
          <Link href={href} className="block truncate font-medium text-foreground hover:underline">
            {label}
          </Link>
        ) : def.onSelect ? (
          <button
            type="button"
            onClick={() => def.onSelect?.(row)}
            className="block max-w-full truncate text-left font-medium text-foreground hover:underline"
          >
            {label}
          </button>
        ) : (
          <span className="block truncate font-medium text-foreground">{label}</span>
        )}
        {subtext != null && <div className="truncate text-xs text-muted-foreground">{subtext}</div>}
      </div>
    </div>
  );
}

function RowActionsMenu<TData>({
  row,
  actions,
  label,
}: {
  row: TData;
  actions: RowAction<TData>[];
  label: string;
}) {
  if (actions.length === 0) return null;
  return (
    // `modal={false}` : Radix's default modal menu drives a body scroll-lock
    // (`overflow: hidden`) on open. On mobile, a wide table already extends a
    // little past the viewport, silently masked by the page's own
    // `overflow-x: clip` — the scroll-lock's style swap disturbs that
    // masking and the layout viewport blows out to the table's full width,
    // visually breaking the whole page. A non-modal menu never touches body
    // overflow, so it can't trigger that. Same class of fix as the
    // `CalendarChip` menu (see the pointer-events-freeze case) ; this menu
    // never opens a follow-up modal dialog itself, so there's no
    // menu→dialog handoff to worry about.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          // Keep the row's activation click from firing when opening the menu.
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {actions.map((action, i) => (
          <Fragment key={i}>
            {action.separatorBefore && i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={action.disabled}
              onSelect={() => action.onSelect(row)}
              className={cn(action.destructive && "text-destructive focus:text-destructive")}
            >
              {action.icon && <action.icon className="mr-2 h-4 w-4" />}
              {action.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
