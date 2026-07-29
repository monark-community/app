"use client";

import { type ReactNode, useState } from "react";
import { Check, Filter, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { PanelTitle } from "./panel-title";

/** One selectable value within a select / multi-select {@link FilterConfig}. */
export interface FilterOption {
  value: string;
  label: ReactNode;
  /**
   * Text the option-search matches against. Defaults to `label` when it's
   * a string ; set this when `label` is a non-string node (icon + text,
   * badge, …) so search still works.
   */
  searchText?: string;
}

interface BaseFilter {
  /** Stable id (used as the React key). */
  id: string;
  /** Field name shown as the top-level menu item / section heading. */
  label: string;
}

/**
 * Single-select field (the default when `type` is omitted). One value out of
 * `options` ; the first option (or `defaultValue`) is the neutral "all" value.
 */
export interface SelectFilter extends BaseFilter {
  type?: "select";
  options: FilterOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** Value considered "not filtering" ; defaults to the first option. */
  defaultValue?: string;
  /**
   * Force the option-search on/off. Defaults to auto: shown once the
   * option count exceeds the internal threshold.
   */
  searchable?: boolean;
}

/** Multi-select field : any subset of `options` (rendered as checkboxes). */
export interface MultiSelectFilter extends BaseFilter {
  type: "multiSelect";
  options: FilterOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  /** Force the option-search on/off (default auto ; see {@link SelectFilter}). */
  searchable?: boolean;
}

/** Free-text field : a "contains" query (rendered as a text input). */
export interface TextFilter extends BaseFilter {
  type: "text";
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

/** Date field : a single day (rendered as a native date input, ISO yyyy-mm-dd). */
export interface DateFilter extends BaseFilter {
  type: "date";
  value: string;
  onValueChange: (value: string) => void;
}

/**
 * A filter, discriminated by `type`. The field's data type picks the input :
 * `select` → radio list, `multiSelect` → checkboxes, `text` → text input,
 * `date` → date input. Omitting `type` means `select` (back-compat).
 */
export type FilterConfig = SelectFilter | MultiSelectFilter | TextFilter | DateFilter;

/** Translated chrome text (kept out of the component per the i18n rule). */
export interface FilterMenuLabels {
  /** aria-label for the trigger button + the mobile modal title. */
  trigger: string;
  /** Mobile modal title (defaults to `trigger` when omitted). */
  title?: string;
  /** aria-label for the mobile modal close button. */
  close: string;
  /** Placeholder for a field's option-search input (only shown when a
   *  field's option list is long enough to search). */
  searchPlaceholder?: string;
  /** Empty-state text when an option-search matches nothing. */
  noResults?: string;
  /** Formats a multi-select's active-value count for the field-row summary
   *  (e.g. `n => `${n} Active``). Falls back to the bare count when omitted. */
  valueCount?: (count: number) => string;
  /** Label for the "reset all filters" action shown at the bottom of the menu.
   *  Omit to hide the action. */
  clearAll?: string;
  /** Label for the per-field "reset this filter" action (shown inside a field's
   *  control once it has a value). Omit to hide it. */
  resetField?: string;
}

/** A filter counts as active when its value differs from its neutral state. */
export function isFilterActive(filter: FilterConfig): boolean {
  switch (filter.type) {
    case "multiSelect":
      return filter.value.length > 0;
    case "text":
    case "date":
      return filter.value.trim() !== "";
    default: {
      const base = filter.defaultValue ?? filter.options[0]?.value;
      return filter.value !== base;
    }
  }
}

export function activeFilterCount(filters: FilterConfig[]): number {
  return filters.filter(isFilterActive).length;
}

/**
 * A small primary dot that flags a filter row as active. Renders an empty
 * fixed-width slot when inactive so the labels of active and inactive rows
 * stay vertically aligned.
 */
export function FilterActiveDot({ filter }: { filter: FilterConfig }) {
  return (
    <span className="flex w-2 shrink-0 items-center justify-center" aria-hidden>
      {isFilterActive(filter) && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
    </span>
  );
}

/** Reset a single filter to its neutral (not-filtering) value. */
export function clearFilter(filter: FilterConfig): void {
  switch (filter.type) {
    case "multiSelect":
      filter.onValueChange([]);
      break;
    case "text":
    case "date":
      filter.onValueChange("");
      break;
    default:
      filter.onValueChange(filter.defaultValue ?? filter.options[0]?.value ?? "");
      break;
  }
}

/** Reset every active filter to its neutral value. */
export function clearAllFilters(filters: FilterConfig[]): void {
  for (const filter of filters) {
    if (isFilterActive(filter)) clearFilter(filter);
  }
}

// Shared row styling so the sticky search header, every reset action
// (all-filters + per-field), and the data-table sort / columns config all read
// identically : an *inset* separator (padded by its band, not full-bleed) and a
// full-width padded button. Mirrors the data-table `ResetRow`.
export const RESET_ROW_CLASS =
  "flex w-full items-center rounded-sm px-1.5 py-1.5 text-sm hover:bg-accent";
export const INSET_SEPARATOR_CLASS = "my-1 h-px bg-border";

/**
 * "Reset filters" action for the non-menu surfaces (mobile modal, the
 * collapsed-tools drill-in Popover / dialog). Callers only render it while at
 * least one filter is active. The desktop dropdown uses a `DropdownMenuItem`
 * instead (menu semantics).
 */
export function FilterClearButton({
  filters,
  label,
  className,
}: {
  filters: FilterConfig[];
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => clearAllFilters(filters)}
      className={cn(RESET_ROW_CLASS, className)}
    >
      <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}

/** Compact summary of the current value, shown on the field's submenu row.
 *  `labels.valueCount`, when given, explains a multi-select's active-value
 *  count (e.g. "3 Active") instead of a bare number. */
export function filterSummary(filter: FilterConfig, labels?: FilterMenuLabels): ReactNode {
  switch (filter.type) {
    case "multiSelect":
      if (filter.value.length === 0) return null;
      return labels?.valueCount ? labels.valueCount(filter.value.length) : filter.value.length;
    case "text":
    case "date":
      return filter.value.trim() !== "" ? filter.value : null;
    default: {
      const base = filter.defaultValue ?? filter.options[0]?.value;
      if (filter.value === base) return null;
      return filter.options.find((o) => o.value === filter.value)?.label ?? null;
    }
  }
}

/**
 * The filter entry-point that sits next to the search field in a
 * {@link FilterBar}. A single icon button reveals every field :
 *
 * - **Desktop** — a dropdown where each field is its own row that opens a
 *   submenu holding that field's value input (so the menu stays short instead
 *   of listing every field *and* value in one long flat list).
 * - **Mobile** — a full-screen modal (title + top-right close) listing the
 *   fields as a scrollable stack of labelled inputs.
 *
 * The input matches the field's data type (see {@link FilterConfig}). The
 * trigger shows a count badge while any filter is active. Text-free : pass
 * already-translated `labels` and per-option `label`s in.
 */
export function FilterMenu({
  filters,
  labels,
  className,
}: {
  filters: FilterConfig[];
  labels: FilterMenuLabels;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeCount = activeFilterCount(filters);

  const trigger = (
    <Button
      variant="outline"
      size="icon"
      aria-label={labels.trigger}
      className={cn("relative shrink-0", className)}
    >
      <Filter className="h-4 w-4" aria-hidden />
      {activeCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
          {activeCount}
        </span>
      )}
    </Button>
  );

  if (isMobile) {
    return (
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent hideClose mobileFullScreen className="gap-0 border-0 p-0">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
            <DialogTitle className="text-base">{labels.title ?? labels.trigger}</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={labels.close}
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            {filters.map((filter) => (
              <div key={filter.id} className="space-y-1">
                <h3 className="flex items-center gap-1.5 px-1 text-sm font-semibold text-foreground">
                  <FilterActiveDot filter={filter} />
                  {filter.label}
                </h3>
                <FilterFieldControl
                  filter={filter}
                  labels={labels}
                  searchSurfaceClassName="bg-background"
                />
              </div>
            ))}
          </div>
          {labels.clearAll && activeCount > 0 && (
            <div className="shrink-0 border-t border-border p-3">
              <FilterClearButton filters={filters} label={labels.clearAll} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <PanelTitle>{labels.title ?? labels.trigger}</PanelTitle>
        {filters.map((filter) => {
          const summary = filterSummary(filter, labels);
          return (
            <DropdownMenuSub key={filter.id}>
              <DropdownMenuSubTrigger>
                <FilterActiveDot filter={filter} />
                <span className="flex-1 truncate">{filter.label}</span>
                {summary != null && (
                  <span className="max-w-28 shrink-0 truncate text-xs text-muted-foreground">
                    {summary}
                  </span>
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto p-0">
                <DesktopFilterControl filter={filter} labels={labels} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        })}
        {labels.clearAll && activeCount > 0 && (
          <>
            <div className={INSET_SEPARATOR_CLASS} />
            <DropdownMenuItem
              // Only shown while something is active, so it never no-ops ; kept
              // open on select so the cleared state (and badge) stays visible.
              onSelect={(e) => {
                e.preventDefault();
                clearAllFilters(filters);
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
              {labels.clearAll}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Show the per-field option search once a select / multi-select field has
// more options than this — small enum fields (status, yes/no) don't need it.
const OPTION_SEARCH_THRESHOLD = 8;

function optionSearchText(option: FilterOption): string {
  if (option.searchText != null) return option.searchText;
  return typeof option.label === "string" ? option.label : "";
}

/** Local search state + the visible option subset for one field. */
function useFilteredOptions(options: FilterOption[], searchableOverride?: boolean) {
  const [query, setQuery] = useState("");
  const searchable = searchableOverride ?? options.length > OPTION_SEARCH_THRESHOLD;
  const q = query.trim().toLowerCase();
  const filtered =
    searchable && q
      ? options.filter((o) => optionSearchText(o).toLowerCase().includes(q))
      : options;
  return { query, setQuery, searchable, filtered };
}

/** Empty-state row shown when an option-search matches nothing. */
function EmptyOptionsRow({ text }: { text?: string }) {
  if (!text) return null;
  return <div className="px-2 py-4 text-center text-xs text-muted-foreground">{text}</div>;
}

/**
 * Search box pinned to the top of a desktop field submenu. The submenu itself
 * drops its padding (`p-0`) so this bar sits flush against the top and spans
 * the full width ; a solid `bg-popover` on the bar *and* an opaque `bg-background`
 * on the input mean scrolled option rows disappear behind it instead of showing
 * through the (otherwise transparent) input.
 */
function DesktopOptionSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    // Opaque sticky band ; its px insets the separator to match the reset row
    // and the sort / columns config (no full-bleed border).
    <div className="sticky top-0 z-20 bg-popover px-1.5 pt-1.5">
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        // Stop Radix's menu typeahead / roving-focus from swallowing keys.
        onKeyDown={(e) => e.stopPropagation()}
        className="h-8 bg-background"
      />
      <div className={INSET_SEPARATOR_CLASS} />
    </div>
  );
}

/** Value input rendered inside a field's desktop submenu. */
function DesktopFilterControl({
  filter,
  labels,
}: {
  filter: FilterConfig;
  labels: FilterMenuLabels;
}) {
  let control: ReactNode;
  switch (filter.type) {
    case "multiSelect":
      control = <DesktopMultiSelectControl filter={filter} labels={labels} />;
      break;
    case "text":
      control = (
        <div className="p-1">
          <Input
            value={filter.value}
            placeholder={filter.placeholder}
            onChange={(e) => filter.onValueChange(e.target.value)}
            // Stop Radix's menu typeahead / roving-focus from swallowing keys.
            onKeyDown={(e) => e.stopPropagation()}
            className="h-8"
          />
        </div>
      );
      break;
    case "date":
      control = (
        <div className="p-1">
          <Input
            type="date"
            value={filter.value}
            onChange={(e) => filter.onValueChange(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            className="h-8"
          />
        </div>
      );
      break;
    default:
      control = <DesktopSelectControl filter={filter} labels={labels} />;
      break;
  }
  return (
    <>
      {control}
      {labels.resetField && isFilterActive(filter) && (
        // Pinned to the bottom (mirror of the sticky option-search at the top)
        // so it's reachable without scrolling a long option list ; the opaque
        // band hides rows scrolling behind it, and its own padding insets the
        // separator + item to match the sort / columns config panels.
        <div className="sticky bottom-0 z-20 bg-popover px-1.5 pb-1.5">
          <div className={INSET_SEPARATOR_CLASS} />
          <DropdownMenuItem
            // Kept open on select so the cleared state is visible.
            onSelect={(e) => {
              e.preventDefault();
              clearFilter(filter);
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
            {labels.resetField}
          </DropdownMenuItem>
        </div>
      )}
    </>
  );
}

function DesktopSelectControl({
  filter,
  labels,
}: {
  filter: SelectFilter;
  labels: FilterMenuLabels;
}) {
  const { query, setQuery, searchable, filtered } = useFilteredOptions(
    filter.options,
    filter.searchable,
  );
  return (
    <>
      {searchable && (
        <DesktopOptionSearch
          value={query}
          onChange={setQuery}
          placeholder={labels.searchPlaceholder}
        />
      )}
      {filtered.length === 0 ? (
        <EmptyOptionsRow text={labels.noResults} />
      ) : (
        <DropdownMenuRadioGroup
          value={filter.value}
          onValueChange={filter.onValueChange}
          className="p-1"
        >
          {filtered.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              onSelect={(e) => e.preventDefault()}
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      )}
    </>
  );
}

function DesktopMultiSelectControl({
  filter,
  labels,
}: {
  filter: MultiSelectFilter;
  labels: FilterMenuLabels;
}) {
  const { query, setQuery, searchable, filtered } = useFilteredOptions(
    filter.options,
    filter.searchable,
  );
  return (
    <>
      {searchable && (
        <DesktopOptionSearch
          value={query}
          onChange={setQuery}
          placeholder={labels.searchPlaceholder}
        />
      )}
      {filtered.length === 0 ? (
        <EmptyOptionsRow text={labels.noResults} />
      ) : (
        <div className="p-1">
          {filtered.map((option) => {
            const checked = filter.value.includes(option.value);
            return (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={checked}
                onCheckedChange={(next) =>
                  filter.onValueChange(
                    next
                      ? [...filter.value, option.value]
                      : filter.value.filter((v) => v !== option.value),
                  )
                }
                onSelect={(e) => e.preventDefault()}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            );
          })}
        </div>
      )}
    </>
  );
}

/** A tappable option row (mobile select / multi-select). */
function OptionRow({
  label,
  selected,
  onClick,
}: {
  label: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted",
        selected && "font-medium text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
    </button>
  );
}

/**
 * Search box pinned above a field's option list on the non-menu surfaces (the
 * mobile modal and the collapsed-tools drill-in Popover). Sticky + opaque so
 * the option rows scroll *behind* it instead of showing through ; the surface
 * colour is passed in because it renders on `bg-popover` (Popover) or
 * `bg-background` (Dialog).
 */
function MobileOptionSearch({
  value,
  onChange,
  placeholder,
  surfaceClassName = "bg-popover",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  surfaceClassName?: string;
}) {
  return (
    <div className={cn("sticky top-0 z-20 px-1.5 pt-1.5", surfaceClassName)}>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        // Stop any parent menu typeahead / roving-focus from swallowing keys.
        onKeyDown={(e) => e.stopPropagation()}
        className="bg-background"
      />
      <div className={INSET_SEPARATOR_CLASS} />
    </div>
  );
}

/**
 * Value input for one filter field, built from plain markup (no menu
 * primitives) — usable inside the mobile modal, a drill-in Popover
 * (`TableTools` collapsed mode), or any non-menu surface.
 */
export function FilterFieldControl({
  filter,
  labels,
  searchSurfaceClassName,
}: {
  filter: FilterConfig;
  labels: FilterMenuLabels;
  /** Background applied to the sticky option-search, so it stays opaque on its
   *  host surface (`bg-popover` in a Popover, `bg-background` in a Dialog). */
  searchSurfaceClassName?: string;
}) {
  let control: ReactNode;
  switch (filter.type) {
    case "text":
      control = (
        <div className="px-1">
          <Input
            value={filter.value}
            placeholder={filter.placeholder}
            onChange={(e) => filter.onValueChange(e.target.value)}
          />
        </div>
      );
      break;
    case "date":
      control = (
        <div className="px-1">
          <Input
            type="date"
            value={filter.value}
            onChange={(e) => filter.onValueChange(e.target.value)}
          />
        </div>
      );
      break;
    case "multiSelect":
      control = (
        <MobileMultiSelectControl
          filter={filter}
          labels={labels}
          searchSurfaceClassName={searchSurfaceClassName}
        />
      );
      break;
    default:
      control = (
        <MobileSelectControl
          filter={filter}
          labels={labels}
          searchSurfaceClassName={searchSurfaceClassName}
        />
      );
      break;
  }
  return (
    <div className="flex flex-col">
      {control}
      {labels.resetField && isFilterActive(filter) && (
        // Sticky at the bottom of the (scrollable) control so it's reachable
        // without scrolling a long option list ; the opaque band hides the rows
        // scrolling behind it and insets the separator + button to match the
        // sort / columns config panels.
        <div
          className={cn(
            "sticky bottom-0 z-20 px-1.5 pb-1.5",
            searchSurfaceClassName ?? "bg-popover",
          )}
        >
          <div className={INSET_SEPARATOR_CLASS} />
          <button type="button" onClick={() => clearFilter(filter)} className={RESET_ROW_CLASS}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
            {labels.resetField}
          </button>
        </div>
      )}
    </div>
  );
}

function MobileSelectControl({
  filter,
  labels,
  searchSurfaceClassName,
}: {
  filter: SelectFilter;
  labels: FilterMenuLabels;
  searchSurfaceClassName?: string;
}) {
  const { query, setQuery, searchable, filtered } = useFilteredOptions(
    filter.options,
    filter.searchable,
  );
  return (
    <div className="flex flex-col">
      {searchable && (
        <MobileOptionSearch
          value={query}
          onChange={setQuery}
          placeholder={labels.searchPlaceholder}
          surfaceClassName={searchSurfaceClassName}
        />
      )}
      {filtered.length === 0 ? (
        <EmptyOptionsRow text={labels.noResults} />
      ) : (
        filtered.map((option) => (
          <OptionRow
            key={option.value}
            label={option.label}
            selected={option.value === filter.value}
            onClick={() => filter.onValueChange(option.value)}
          />
        ))
      )}
    </div>
  );
}

function MobileMultiSelectControl({
  filter,
  labels,
  searchSurfaceClassName,
}: {
  filter: MultiSelectFilter;
  labels: FilterMenuLabels;
  searchSurfaceClassName?: string;
}) {
  const { query, setQuery, searchable, filtered } = useFilteredOptions(
    filter.options,
    filter.searchable,
  );
  return (
    <div className="flex flex-col">
      {searchable && (
        <MobileOptionSearch
          value={query}
          onChange={setQuery}
          placeholder={labels.searchPlaceholder}
          surfaceClassName={searchSurfaceClassName}
        />
      )}
      {filtered.length === 0 ? (
        <EmptyOptionsRow text={labels.noResults} />
      ) : (
        filtered.map((option) => (
          <OptionRow
            key={option.value}
            label={option.label}
            selected={filter.value.includes(option.value)}
            onClick={() =>
              filter.onValueChange(
                filter.value.includes(option.value)
                  ? filter.value.filter((v) => v !== option.value)
                  : [...filter.value, option.value],
              )
            }
          />
        ))
      )}
    </div>
  );
}
