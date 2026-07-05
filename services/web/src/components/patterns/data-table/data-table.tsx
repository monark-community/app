"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type Header,
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
import {
  ACTIONS_COLUMN_ID,
  PRIMARY_COLUMN_ID,
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
  selectedRowId,
  isLoading = false,
  isError = false,
  onRetry,
  skeletonRows = 3,
  emptyState,
  pagination,
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

    return [primaryDef, ...dataDefs, ...actionsDef];
  }, [primaryColumn, columns, rowActions, labels.rowActions]);

  const columnOrder = useMemo(
    () => [PRIMARY_COLUMN_ID, ...dataColumnOrder, ...(rowActions ? [ACTIONS_COLUMN_ID] : [])],
    [dataColumnOrder, rowActions],
  );

  const table = useReactTable({
    data,
    columns: tableColumns,
    getRowId: (row) => getRowId(row),
    state: {
      columnOrder,
      columnVisibility: layout.columnVisibility,
      columnSizing: layout.columnSizing,
      sorting: layout.sorting,
    },
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

  const visibleColumnCount = table.getVisibleLeafColumns().length;
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

  return (
    <div className={cn("flex w-full min-w-0 flex-col", className)}>
      <div className="overflow-x-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="min-w-full table-fixed text-sm" style={{ width: table.getTotalSize() }}>
            <thead className="bg-muted/30">
              {!configResolved ? (
                // Skeleton headers until the column config resolves, so they
                // never flash in the default order then reorder.
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {table.getVisibleLeafColumns().map((col) => (
                    <th key={col.id} className="h-9 px-4" style={{ width: col.getSize() }}>
                      {col.id !== ACTIONS_COLUMN_ID && <Skeleton className="h-3 w-16 max-w-full" />}
                    </th>
                  ))}
                </tr>
              ) : (
                table.getHeaderGroups().map((headerGroup) => (
                  <tr
                    key={headerGroup.id}
                    className="text-left text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    <SortableContext
                      items={dataColumnOrder}
                      strategy={horizontalListSortingStrategy}
                    >
                      {headerGroup.headers.map((header) => {
                        const isReorderable =
                          header.column.id !== PRIMARY_COLUMN_ID &&
                          header.column.id !== ACTIONS_COLUMN_ID;
                        return isReorderable ? (
                          <SortableHeader key={header.id} header={header} />
                        ) : (
                          <StaticHeader key={header.id} header={header} />
                        );
                      })}
                    </SortableContext>
                  </tr>
                ))
              )}
            </thead>
            <tbody>
              {showSkeleton &&
                Array.from({ length: skeletonRows }).map((_, r) => (
                  <tr key={r} className="border-t border-border">
                    {table.getVisibleLeafColumns().map((col) => (
                      <td key={col.id} className="px-4 py-3">
                        <Skeleton className="h-4 w-full max-w-32" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!showSkeleton && isError && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={visibleColumnCount}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <p>{labels.errorTitle}</p>
                      {onRetry && labels.retry && (
                        <Button variant="outline" size="sm" onClick={onRetry}>
                          {labels.retry}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {!showSkeleton && !isError && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={visibleColumnCount}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    {emptyState}
                  </td>
                </tr>
              )}

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
                        "border-t border-border transition-colors",
                        canActivate && "cursor-pointer",
                        isSelected
                          ? "bg-primary/10 ring-1 ring-inset ring-primary"
                          : "hover:bg-muted/30",
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-4 py-3 align-middle"
                          style={{ width: cell.column.getSize() }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </table>
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
function StaticHeader<TData>({ header }: { header: Header<TData, unknown> }) {
  return (
    <th className="group/th relative h-9 px-4 font-medium" style={{ width: header.getSize() }}>
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
          // table shows no per-column arrows.
          <ArrowUpDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover/th:opacity-100"
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
      className="absolute right-0 top-0 h-full w-1.5"
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
    <DropdownMenu>
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
