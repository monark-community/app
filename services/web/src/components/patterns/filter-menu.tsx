"use client";

import { Fragment, type ReactNode, useState } from "react";
import { Check, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-is-mobile";

/** One selectable value within a {@link FilterConfig}. */
export interface FilterOption {
  value: string;
  label: ReactNode;
}

/**
 * A single filter: a named group of mutually-exclusive options bound to a
 * caller-owned value. The first option is treated as the neutral / "all"
 * value — a filter counts as *active* (and lights the trigger badge) when
 * its value differs from it, unless `defaultValue` says otherwise.
 */
export interface FilterConfig {
  id: string;
  label: string;
  options: FilterOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** Value considered "not filtering" ; defaults to the first option. */
  defaultValue?: string;
}

/** Translated chrome text (kept out of the component per the i18n rule). */
export interface FilterMenuLabels {
  /** aria-label for the trigger button + the mobile modal title. */
  trigger: string;
  /** Mobile modal title (defaults to `trigger` when omitted). */
  title?: string;
  /** aria-label for the mobile modal close button. */
  close: string;
}

function activeFilterCount(filters: FilterConfig[]): number {
  return filters.filter((f) => {
    const base = f.defaultValue ?? f.options[0]?.value;
    return f.value !== base;
  }).length;
}

/**
 * The filter entry-point that sits next to the search field in a
 * {@link FilterBar}. A single icon button reveals every filter:
 *
 * - **Desktop** — a dropdown with each filter as a labelled radio group.
 * - **Mobile** — a full-screen modal (title + top-right close) listing the
 *   filters as a scrollable stack of option menus.
 *
 * The trigger shows a count badge while any filter is active. Text-free:
 * pass already-translated `labels` and per-option `label`s in.
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
                <h3 className="px-1 text-sm font-semibold text-foreground">{filter.label}</h3>
                <div className="flex flex-col">
                  {filter.options.map((option) => {
                    const selected = option.value === filter.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => filter.onValueChange(option.value)}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                          selected && "font-medium text-foreground",
                        )}
                      >
                        <span className="truncate">{option.label}</span>
                        {selected && (
                          <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {filters.map((filter, i) => (
          <Fragment key={filter.id}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{filter.label}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={filter.value} onValueChange={filter.onValueChange}>
              {filter.options.map((option) => (
                <DropdownMenuRadioItem
                  key={option.value}
                  value={option.value}
                  onSelect={(e) => e.preventDefault()}
                >
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
