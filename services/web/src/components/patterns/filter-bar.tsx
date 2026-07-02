"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Toolbar row that sits above a list / table. The search field and the
 * {@link FilterMenu} filter button travel together as one group (an 8px
 * gap between them) ; the primary CTA lands in the trailing `actions`
 * slot, pushed to the right.
 *
 * Layout follows the viewport: on mobile the search+filter group grows to
 * fill the row (search takes the available width) ; on desktop the group
 * shrinks to content, so the search field holds its fixed width.
 *
 * Presentational only — the caller supplies the concrete `search` /
 * `filter` / `actions` nodes (i18n stays with the caller). Pair the
 * `search` slot with {@link FilterBarSearch} and the `filter` slot with
 * {@link FilterMenu}.
 */
export function FilterBar({
  search,
  filter,
  actions,
  className,
}: {
  search?: ReactNode;
  filter?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex flex-1 items-center gap-2 md:flex-none">
        {search}
        {filter}
      </div>
      {actions != null && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Search field with a leading magnifier icon. Controlled — the caller
 * owns the value + debounce. Grows to fill the available width on mobile ;
 * holds a fixed ~350px on desktop so the toolbar stays stable.
 */
export function FilterBarSearch({
  value,
  onChange,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("relative min-w-0 flex-1 md:w-[350px] md:flex-none", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="pl-8"
      />
    </div>
  );
}
