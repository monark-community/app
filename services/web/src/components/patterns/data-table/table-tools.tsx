"use client";

import { useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ArrowUpDown, Columns3, Filter, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFilterBarToolsBudget } from "../filter-bar";
import { fitVisibleCount } from "../overflow";
import {
  FilterActiveDot,
  FilterClearButton,
  FilterFieldControl,
  FilterMenu,
  activeFilterCount,
  filterSummary,
  type FilterConfig,
  type FilterMenuLabels,
} from "../filter-menu";
import { ColumnsPanel, MenuNavRow, SortingPanel, SubmenuHeader } from "./panels";
import { PanelTitle } from "../panel-title";
import {
  PRIMARY_COLUMN_ID,
  type DataColumnDef,
  type DataTableSortLabels,
  type PrimaryColumnDef,
} from "./types";
import { reconcileColumnOrder, type DataTableLayout } from "./use-data-table-layout";

/** Translated chrome text for the toolbar controls. */
export interface TableToolsLabels {
  /** aria-label for the collapsed trigger + the mobile dialog title. */
  tools: string;
  /** aria-label for the mobile dialog close button. */
  close: string;
  /** Columns trigger aria-label + panel heading. */
  columns: string;
  /** Reset-layout action. */
  reset: string;
  /** Sorting trigger aria-label + panel strings. */
  sort: DataTableSortLabels;
  /** Filter strings ; required when `filters` are passed. */
  filters?: FilterMenuLabels;
}

// Icon button (36px) + the toolbar's 8px gap.
const ITEM = 44;

type ToolId = "filters" | "sorting" | "columns";
type ToolsView = "root" | "filters" | { filterId: string } | "sorting" | "columns";

/**
 * The list-control cluster for a {@link FilterBar} `tools` slot : a filter
 * menu, a sorting editor, and a column-layout editor, wired to the same
 * {@link DataTableLayout} as the table. When the toolbar gets tight the
 * controls collapse (right-to-left) into a single trigger opening a
 * drill-in popover ; on mobile they always collapse, into a full-screen
 * dialog.
 */
export function TableTools<TData>({
  layout,
  primaryColumn,
  columns,
  filters,
  labels,
  className,
  include,
  mode = "auto",
  extraSections,
}: {
  layout: DataTableLayout;
  primaryColumn: PrimaryColumnDef<TData>;
  columns: DataColumnDef<TData>[];
  filters?: FilterConfig[];
  labels: TableToolsLabels;
  className?: string;
  /** Which controls this instance renders (default all). Lets a screen split
   *  the cluster — e.g. filters + sorting next to the search, and a separate
   *  `include={["columns"]}` instance over with the right-hand actions. */
  include?: ToolId[];
  /**
   * Render strategy, decoupled from the viewport so a responsive layout can
   * mount both forms behind CSS `md:` wrappers :
   * - `"auto"` (default) — inline on desktop, collapse to the full-screen sheet
   *   on mobile (the original behaviour).
   * - `"inline"` — always inline (desktop toolbar cluster), never the sheet.
   * - `"sheet"` — always the single ⋯ trigger + full-screen options sheet
   *   (the consolidated mobile list-options surface).
   */
  mode?: "auto" | "inline" | "sheet";
  /** Extra rows appended below the columns section in the `sheet` view — e.g. a
   *  "Follow this list" row — so per-list actions live in one options surface on
   *  mobile. Ignored by the inline / desktop rendering. */
  extraSections?: ReactNode;
}) {
  const autoMobile = useIsMobile();
  const budget = useFilterBarToolsBudget();

  const sortFields = [
    ...(primaryColumn.enableSorting && primaryColumn.sortAccessor
      ? [{ id: PRIMARY_COLUMN_ID, header: primaryColumn.header }]
      : []),
    ...columns
      .filter((c) => c.enableSorting && c.sortAccessor)
      .map((c) => ({ id: c.id, header: c.header })),
  ];
  const columnFields = columns.map((c) => ({
    id: c.id,
    header: c.header,
    canHide: c.enableHiding ?? true,
  }));
  const order = reconcileColumnOrder(
    layout.columnOrder,
    columns.map((c) => c.id),
  );

  const hasFilters = !!filters && filters.length > 0 && !!labels.filters;
  const activeFilters = hasFilters && filters ? activeFilterCount(filters) : 0;
  // Only sorts a toolbar control can produce count as "active" — a header
  // click on a column with no sort UI still shouldn't badge the trigger.
  const sortCount = layout.sorting.length;

  const includeSet = include ?? ["filters", "sorting", "columns"];
  const tools: ToolId[] = [
    ...(hasFilters && includeSet.includes("filters") ? (["filters"] as const) : []),
    ...(sortFields.length > 0 && includeSet.includes("sorting") ? (["sorting"] as const) : []),
    ...(includeSet.includes("columns") ? (["columns"] as const) : []),
  ];

  if (tools.length === 0) return null;

  // Sheet when explicitly asked, or (in `auto`) on mobile once several controls
  // would otherwise crowd the row. A single-control `auto` instance (e.g. an
  // `include={["columns"]}` split) stays inline — a full-screen sheet for one
  // control isn't worth it. `inline` never uses the sheet.
  const useSheet = mode === "sheet" || (mode === "auto" && autoMobile && tools.length > 1);
  if (useSheet) {
    return (
      <MobileToolsDialog
        filters={hasFilters ? filters : undefined}
        sortFields={sortFields}
        columnFields={columnFields}
        order={order}
        layout={layout}
        labels={labels}
        badgeCount={activeFilters + sortCount}
        className={className}
        extraSections={extraSections}
      />
    );
  }

  const visibleCount = fitVisibleCount(budget ?? Number.POSITIVE_INFINITY, ITEM, tools.length);
  const visible = tools.slice(0, visibleCount);
  const overflow = tools.slice(visibleCount);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {visible.includes("filters") && hasFilters && filters && labels.filters && (
        <FilterMenu filters={filters} labels={labels.filters} />
      )}

      {visible.includes("sorting") && (
        <Popover>
          <PopoverTrigger asChild>
            <ToolTriggerButton
              icon={<ArrowUpDown className="h-4 w-4" aria-hidden />}
              label={labels.sort.label}
              badgeCount={sortCount}
            />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-1.5">
            <PanelTitle>{labels.sort.label}</PanelTitle>
            <SortingPanel
              fields={sortFields}
              sorting={layout.sorting}
              setSorting={layout.setSorting}
              labels={labels.sort}
            />
          </PopoverContent>
        </Popover>
      )}

      {visible.includes("columns") && (
        <Popover>
          <PopoverTrigger asChild>
            <ToolTriggerButton
              icon={<Columns3 className="h-4 w-4" aria-hidden />}
              label={labels.columns}
            />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 p-1.5">
            <PanelTitle>{labels.columns}</PanelTitle>
            <ColumnsPanel
              fields={columnFields}
              order={order}
              visibility={layout.columnVisibility}
              setColumnOrder={layout.setColumnOrder}
              setColumnVisibility={layout.setColumnVisibility}
            />
            {layout.columnsModified && <ResetRow label={labels.reset} onClick={layout.reset} />}
          </PopoverContent>
        </Popover>
      )}

      {overflow.length > 0 && (
        <CollapsedToolsPopover
          tools={overflow}
          filters={hasFilters ? filters : undefined}
          sortFields={sortFields}
          columnFields={columnFields}
          order={order}
          layout={layout}
          labels={labels}
          badgeCount={
            (overflow.includes("filters") ? activeFilters : 0) +
            (overflow.includes("sorting") ? sortCount : 0)
          }
        />
      )}
    </div>
  );
}

/** Outline icon button with the little active-count badge. */
function ToolTriggerButton({
  icon,
  label,
  badgeCount = 0,
  ...props
}: {
  icon: ReactNode;
  label: string;
  badgeCount?: number;
} & ComponentPropsWithoutRef<typeof Button>) {
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={label}
      className="relative shrink-0"
      {...props}
    >
      {icon}
      {badgeCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
          {badgeCount}
        </span>
      )}
    </Button>
  );
}

/** Reset-layout row appended under the columns panel. */
function ResetRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <>
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center rounded-sm px-1.5 py-1.5 text-sm hover:bg-accent"
      >
        <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
        {label}
      </button>
    </>
  );
}

/** Root row inside the collapsed popover for one filter field. */
function FilterFieldNavRow({
  filter,
  labels,
  onClick,
}: {
  filter: FilterConfig;
  labels?: FilterMenuLabels;
  onClick: () => void;
}) {
  const summary = filterSummary(filter, labels);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 text-sm hover:bg-accent"
    >
      <FilterActiveDot filter={filter} />
      <span className="min-w-0 flex-1 truncate text-left">{filter.label}</span>
      {summary != null && (
        <span className="max-w-28 shrink-0 truncate text-xs text-muted-foreground">{summary}</span>
      )}
    </button>
  );
}

/**
 * The overflowed controls behind one trigger: a Popover whose root lists the
 * collapsed tools and drills into each one's panel (Popover — not a
 * DropdownMenu — because the sorting / columns panels drag-reorder with
 * dnd-kit, which fights a menu's roving-focus semantics).
 */
function CollapsedToolsPopover({
  tools,
  filters,
  sortFields,
  columnFields,
  order,
  layout,
  labels,
  badgeCount,
}: {
  tools: ToolId[];
  filters?: FilterConfig[];
  sortFields: { id: string; header: string }[];
  columnFields: { id: string; header: string; canHide: boolean }[];
  order: string[];
  layout: DataTableLayout;
  labels: TableToolsLabels;
  badgeCount: number;
}) {
  const [view, setView] = useState<ToolsView>("root");
  // Local const so the narrowing survives into JSX callbacks below.
  const filterLabels = labels.filters;
  const activeFilter =
    typeof view === "object" && filters ? filters.find((f) => f.id === view.filterId) : undefined;

  const firstSort = layout.sorting[0];
  const firstSortHeader = firstSort
    ? (sortFields.find((f) => f.id === firstSort.id)?.header ?? firstSort.id)
    : null;
  const sortSummary = firstSortHeader
    ? layout.sorting.length > 1
      ? `${firstSortHeader} +${layout.sorting.length - 1}`
      : firstSortHeader
    : labels.sort.none;

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) setView("root");
      }}
    >
      <PopoverTrigger asChild>
        <ToolTriggerButton
          icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
          label={labels.tools}
          badgeCount={badgeCount}
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-96 w-64 overflow-y-auto p-1.5">
        {view === "root" && (
          <div className="flex flex-col">
            {tools.includes("filters") && filters && filterLabels && (
              <MenuNavRow
                icon={Filter}
                label={filterLabels.title ?? filterLabels.trigger}
                summary={
                  activeFilterCount(filters) > 0 ? String(activeFilterCount(filters)) : undefined
                }
                onClick={() => setView("filters")}
              />
            )}
            {tools.includes("sorting") && sortFields.length > 0 && (
              <MenuNavRow
                icon={ArrowUpDown}
                label={labels.sort.label}
                summary={sortSummary}
                onClick={() => setView("sorting")}
              />
            )}
            {tools.includes("columns") && (
              <MenuNavRow
                icon={Columns3}
                label={labels.columns}
                onClick={() => setView("columns")}
              />
            )}
          </div>
        )}

        {view === "filters" && filters && filterLabels && (
          <div className="flex flex-col">
            <SubmenuHeader
              label={filterLabels.title ?? filterLabels.trigger}
              onBack={() => setView("root")}
            />
            {filters.map((filter) => (
              <FilterFieldNavRow
                key={filter.id}
                filter={filter}
                labels={filterLabels}
                onClick={() => setView({ filterId: filter.id })}
              />
            ))}
            {filterLabels.clearAll && activeFilterCount(filters) > 0 && (
              <>
                <div className="my-1 h-px bg-border" />
                <FilterClearButton filters={filters} label={filterLabels.clearAll} />
              </>
            )}
          </div>
        )}

        {activeFilter && filterLabels && (
          <div className="flex flex-col">
            <SubmenuHeader label={activeFilter.label} onBack={() => setView("filters")} />
            <FilterFieldControl filter={activeFilter} labels={filterLabels} />
          </div>
        )}

        {view === "sorting" && (
          <div className="flex flex-col">
            <SubmenuHeader label={labels.sort.label} onBack={() => setView("root")} />
            <SortingPanel
              fields={sortFields}
              sorting={layout.sorting}
              setSorting={layout.setSorting}
              labels={labels.sort}
            />
          </div>
        )}

        {view === "columns" && (
          <div className="flex flex-col">
            <SubmenuHeader label={labels.columns} onBack={() => setView("root")} />
            <ColumnsPanel
              fields={columnFields}
              order={order}
              visibility={layout.columnVisibility}
              setColumnOrder={layout.setColumnOrder}
              setColumnVisibility={layout.setColumnVisibility}
            />
            {layout.columnsModified && <ResetRow label={labels.reset} onClick={layout.reset} />}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Mobile: every control behind one trigger, in a full-screen dialog of
 *  labelled sections (mirrors the FilterMenu modal treatment). */
function MobileToolsDialog({
  filters,
  sortFields,
  columnFields,
  order,
  layout,
  labels,
  badgeCount,
  className,
  extraSections,
}: {
  filters?: FilterConfig[];
  sortFields: { id: string; header: string }[];
  columnFields: { id: string; header: string; canHide: boolean }[];
  order: string[];
  layout: DataTableLayout;
  labels: TableToolsLabels;
  badgeCount: number;
  className?: string;
  extraSections?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Local const so the narrowing survives into JSX callbacks below.
  const filterLabels = labels.filters;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ToolTriggerButton
          icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
          label={labels.tools}
          badgeCount={badgeCount}
          className={className}
        />
      </DialogTrigger>
      <DialogContent hideClose mobileFullScreen className="gap-0 border-0 p-0">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <DialogTitle className="text-base">{labels.tools}</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={labels.close}
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {filters && filterLabels && (
            <>
              {filters.map((filter) => (
                <div key={filter.id} className="space-y-1">
                  <h3 className="px-1 text-sm font-semibold text-foreground">{filter.label}</h3>
                  <FilterFieldControl
                    filter={filter}
                    labels={filterLabels}
                    searchSurfaceClassName="bg-background"
                  />
                </div>
              ))}
              {filterLabels.clearAll && activeFilterCount(filters) > 0 && (
                <>
                  <div className="my-1 h-px bg-border" />
                  <FilterClearButton filters={filters} label={filterLabels.clearAll} />
                </>
              )}
            </>
          )}
          {sortFields.length > 0 && (
            <div className="space-y-1">
              <h3 className="px-1 text-sm font-semibold text-foreground">{labels.sort.label}</h3>
              <SortingPanel
                fields={sortFields}
                sorting={layout.sorting}
                setSorting={layout.setSorting}
                labels={labels.sort}
              />
            </div>
          )}
          <div className="space-y-1">
            <h3 className="px-1 text-sm font-semibold text-foreground">{labels.columns}</h3>
            <ColumnsPanel
              fields={columnFields}
              order={order}
              visibility={layout.columnVisibility}
              setColumnOrder={layout.setColumnOrder}
              setColumnVisibility={layout.setColumnVisibility}
            />
            {layout.columnsModified && <ResetRow label={labels.reset} onClick={layout.reset} />}
          </div>
          {extraSections}
        </div>
      </DialogContent>
    </Dialog>
  );
}
