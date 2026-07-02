"use client";

import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  type ColumnDef,
  type ColumnSizingState,
  type Header,
  type SortingState,
  type VisibilityState,
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
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  MoreHorizontal,
  PanelRight,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { CellEdit, DataTableProps, PrimaryColumnDef, RowAction, SortAccessor } from "./types";

const PRIMARY_ID = "__primary";
const ACTIONS_ID = "__actions";

type PersistedLayout = {
  columnOrder: string[];
  columnVisibility: VisibilityState;
  columnSizing: ColumnSizingState;
  sorting: SortingState;
};

function normalizeSort(value: string | number | Date | null | undefined): string | number {
  if (value == null) return "";
  if (value instanceof Date) return value.getTime();
  return value;
}

function toAccessor<TData>(acc: SortAccessor<TData>) {
  return (row: TData) => normalizeSort(acc(row));
}

/** Reconcile a stored data-column order against the current column set:
 *  keep known ids in their saved order, append any newly-added columns. */
function reconcileOrder(stored: string[], current: string[]): string[] {
  const set = new Set(current);
  const kept = stored.filter((id) => set.has(id));
  const appended = current.filter((id) => !kept.includes(id));
  return [...kept, ...appended];
}

export function DataTable<TData>({
  data,
  getRowId,
  primaryColumn,
  columns,
  rowActions,
  storageKey,
  labels,
  selectedRowId,
  isLoading = false,
  isError = false,
  onRetry,
  skeletonRows = 3,
  emptyState,
  className,
  chrome = "calm",
}: DataTableProps<TData>) {
  const calm = chrome === "calm";
  const defaultDataOrder = useMemo(() => columns.map((c) => c.id), [columns]);

  const [dataColumnOrder, setDataColumnOrder] = useState<string[]>(defaultDataOrder);
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
        if (Array.isArray(p.columnOrder))
          setDataColumnOrder(reconcileOrder(p.columnOrder, defaultDataOrder));
        if (p.columnVisibility) setColumnVisibility(p.columnVisibility);
        if (p.columnSizing) setColumnSizing(p.columnSizing);
        if (Array.isArray(p.sorting)) setSorting(p.sorting);
      }
    } catch {
      // ignore corrupt / unavailable storage
    }
    setHydrated(true);
  }, [storageKey, defaultDataOrder]);

  useEffect(() => {
    if (!hydrated) return;
    const layout: PersistedLayout = {
      columnOrder: dataColumnOrder,
      columnVisibility,
      columnSizing,
      sorting,
    };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      // ignore
    }
  }, [hydrated, storageKey, dataColumnOrder, columnVisibility, columnSizing, sorting]);

  function resetLayout() {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setDataColumnOrder(defaultDataOrder);
    setColumnVisibility({});
    setColumnSizing({});
    setSorting([]);
  }

  const tableColumns = useMemo<ColumnDef<TData>[]>(() => {
    const primaryDef: ColumnDef<TData> = {
      id: PRIMARY_ID,
      header: primaryColumn.header,
      enableHiding: false,
      enableSorting: !!(primaryColumn.enableSorting && primaryColumn.sortAccessor),
      size: primaryColumn.size ?? 280,
      minSize: primaryColumn.minSize ?? 160,
      ...(primaryColumn.enableSorting && primaryColumn.sortAccessor
        ? { accessorFn: toAccessor(primaryColumn.sortAccessor) }
        : {}),
      cell: ({ row }) => (
        <PrimaryCell row={row.original} def={primaryColumn} openPanelLabel={labels.openPanel} />
      ),
    };

    const dataDefs: ColumnDef<TData>[] = columns.map((c) => ({
      id: c.id,
      header: c.header,
      enableHiding: c.enableHiding ?? true,
      enableSorting: !!(c.enableSorting && c.sortAccessor),
      size: c.size ?? 160,
      minSize: c.minSize ?? 80,
      ...(c.enableSorting && c.sortAccessor ? { accessorFn: toAccessor(c.sortAccessor) } : {}),
      cell: ({ row }) => (
        <div className={cn("truncate", c.align === "right" && "text-right")}>
          {c.edit ? (
            <EditableCell
              row={row.original}
              edit={c.edit}
              display={c.cell(row.original)}
              ariaLabel={c.header}
            />
          ) : (
            c.cell(row.original)
          )}
        </div>
      ),
    }));

    const actionsDef: ColumnDef<TData>[] = rowActions
      ? [
          {
            id: ACTIONS_ID,
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
    () => [PRIMARY_ID, ...dataColumnOrder, ...(rowActions ? [ACTIONS_ID] : [])],
    [dataColumnOrder, rowActions],
  );

  const table = useReactTable({
    data,
    columns: tableColumns,
    getRowId: (row) => getRowId(row),
    state: { columnOrder, columnVisibility, columnSizing, sorting },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onSortingChange: setSorting,
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
    setDataColumnOrder((prev) => {
      const from = prev.indexOf(String(active.id));
      const to = prev.indexOf(String(over.id));
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  }

  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const hideableColumns = table.getAllColumns().filter((c) => c.getCanHide());
  const rows = table.getRowModel().rows;

  const columnMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {calm ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-background/80"
            aria-label={labels.columns}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="gap-1.5">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {labels.columns}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {hideableColumns.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.id}
            checked={c.getIsVisible()}
            onCheckedChange={(v) => c.toggleVisibility(!!v)}
            onSelect={(e) => e.preventDefault()}
          >
            {String(c.columnDef.header ?? c.id)}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={resetLayout}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
          {labels.reset}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className={cn("group/table relative flex w-full min-w-0 flex-col", className)}>
      {calm ? (
        // Calm : the layout menu floats in the top-right corner and only
        // fades in on hover / focus, so a quiet list shows no chrome bar.
        <div className="pointer-events-none absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover/table:opacity-100 focus-within:opacity-100 [&>*]:pointer-events-auto">
          {columnMenu}
        </div>
      ) : (
        <div className="flex items-center justify-end border-b border-border px-2 py-1.5">
          {columnMenu}
        </div>
      )}

      <div className="overflow-x-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="min-w-full table-fixed text-sm" style={{ width: table.getTotalSize() }}>
            <thead className="bg-muted/30">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="text-left text-xs uppercase tracking-wide text-muted-foreground"
                >
                  <SortableContext items={dataColumnOrder} strategy={horizontalListSortingStrategy}>
                    {headerGroup.headers.map((header) => {
                      const isReorderable =
                        header.column.id !== PRIMARY_ID && header.column.id !== ACTIONS_ID;
                      return isReorderable ? (
                        <SortableHeader key={header.id} header={header} calm={calm} />
                      ) : (
                        <StaticHeader key={header.id} header={header} calm={calm} />
                      );
                    })}
                  </SortableContext>
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: skeletonRows }).map((_, r) => (
                  <tr key={r} className="border-t border-border">
                    {table.getVisibleLeafColumns().map((col) => (
                      <td key={col.id} className="px-4 py-3">
                        <Skeleton className="h-4 w-full max-w-32" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!isLoading && isError && rows.length === 0 && (
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

              {!isLoading && !isError && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={visibleColumnCount}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    {emptyState}
                  </td>
                </tr>
              )}

              {!isLoading &&
                rows.map((row) => {
                  const isSelected = selectedRowId != null && row.id === selectedRowId;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-t border-border transition-colors",
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
    </div>
  );
}

/** Header for the pinned primary / actions columns: sortable-by-click if
 *  the column allows it, resizable, but never draggable. */
function StaticHeader<TData>({ header, calm }: { header: Header<TData, unknown>; calm: boolean }) {
  return (
    <th className="group/th relative h-9 px-4 font-medium" style={{ width: header.getSize() }}>
      <HeaderLabel header={header} calm={calm} />
      <ResizeHandle header={header} />
    </th>
  );
}

/** Reorderable data-column header — drag to move, click to sort. */
function SortableHeader<TData>({
  header,
  calm,
}: {
  header: Header<TData, unknown>;
  calm: boolean;
}) {
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
      <HeaderLabel
        header={header}
        calm={calm}
        dragAttributes={attributes}
        dragListeners={listeners}
      />
      <ResizeHandle header={header} />
    </th>
  );
}

function HeaderLabel<TData>({
  header,
  calm,
  dragAttributes,
  dragListeners,
}: {
  header: Header<TData, unknown>;
  calm: boolean;
  dragAttributes?: ReturnType<typeof useSortable>["attributes"];
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
}) {
  const canSort = header.column.getCanSort();
  const sorted = header.column.getIsSorted();
  const content = flexRender(header.column.columnDef.header, header.getContext());

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
      <span className="truncate">{content}</span>
      {canSort &&
        (sorted === "asc" ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : sorted === "desc" ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          // Idle sort hint. In calm mode it stays hidden until the header is
          // hovered, so a quiet table shows no per-column arrows.
          <ChevronsUpDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground/50",
              calm && "opacity-0 transition-opacity group-hover/th:opacity-100",
            )}
            aria-hidden
          />
        ))}
    </button>
  );
}

function ResizeHandle<TData>({ header }: { header: Header<TData, unknown> }) {
  if (!header.column.getCanResize()) return null;
  return (
    <div
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none",
        "hover:bg-border",
        header.column.getIsResizing() && "bg-primary",
      )}
    />
  );
}

function PrimaryCell<TData>({
  row,
  def,
  openPanelLabel,
}: {
  row: TData;
  def: PrimaryColumnDef<TData>;
  openPanelLabel: string;
}) {
  const isMobile = useIsMobile();
  const label = def.label(row);
  const subtext = def.subtext?.(row);
  const leading = def.leading?.(row);
  const href = def.href?.(row);
  const canOpen = !!href || !!def.onSelect;
  // Inline editing is a pointer-precise, hover-driven affordance ; on
  // touch it collides with "tap the row to open the panel", so on mobile
  // the primary label opens the panel instead of entering edit mode.
  const editable = !!def.edit && !isMobile;

  // The open-panel affordance: an icon next to the label. On desktop it
  // reveals on cell hover (and is the *only* way to open the panel when
  // the label is inline-editable) ; on mobile it stays visible as a tap
  // target since hover doesn't exist.
  const openIcon = canOpen ? (
    <Button
      asChild={!!href}
      variant="ghost"
      size="icon"
      className={cn(
        "h-6 w-6 shrink-0 text-muted-foreground transition-opacity focus-visible:opacity-100",
        isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100",
      )}
      {...(href ? {} : { onClick: () => def.onSelect?.(row) })}
    >
      {href ? (
        <Link href={href} aria-label={openPanelLabel}>
          <PanelRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : (
        <>
          <PanelRight className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">{openPanelLabel}</span>
        </>
      )}
    </Button>
  ) : null;

  return (
    <div className="group flex min-w-0 items-center gap-3">
      {leading != null && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            {editable && def.edit ? (
              <EditableCell
                row={row}
                edit={def.edit}
                display={<span className="font-medium text-foreground">{label}</span>}
                ariaLabel={def.header}
                displayClassName="font-medium text-foreground"
              />
            ) : href ? (
              <Link
                href={href}
                className="block truncate font-medium text-foreground hover:underline"
              >
                {label}
              </Link>
            ) : (
              <span className="block truncate font-medium text-foreground">{label}</span>
            )}
          </div>
          {openIcon}
        </div>
        {subtext != null && <div className="truncate text-xs text-muted-foreground">{subtext}</div>}
      </div>
    </div>
  );
}

/**
 * Inline-editable value. Read view shows `display` (the column's normal
 * cell content) with a click-to-edit affordance ; editing swaps in a
 * text input that commits on Enter / blur and reverts on Escape.
 */
function EditableCell<TData>({
  row,
  edit,
  display,
  ariaLabel,
  displayClassName,
}: {
  row: TData;
  edit: CellEdit<TData>;
  display: ReactNode;
  ariaLabel: string;
  displayClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Set when Escape cancels, so the blur that fires as the input unmounts
  // doesn't commit the reverted draft.
  const cancelledRef = useRef(false);

  function begin() {
    setDraft(edit.getValue(row));
    cancelledRef.current = false;
    setEditing(true);
  }

  function commit() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const next = draft.trim();
    if (next && next !== edit.getValue(row)) edit.onSave(row, next);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelledRef.current = true;
            setEditing(false);
          }
        }}
        maxLength={edit.maxLength}
        placeholder={edit.placeholder}
        aria-label={ariaLabel}
        className="h-7 w-full rounded border border-input bg-background px-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={begin}
      className={cn(
        "-mx-1 block max-w-full cursor-text truncate rounded px-1 text-left hover:bg-muted/60",
        displayClassName,
      )}
    >
      {display}
    </button>
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
        <Button variant="ghost" size="icon" className="h-7 w-7">
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
