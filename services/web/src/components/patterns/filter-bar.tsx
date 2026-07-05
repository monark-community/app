"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Pixel budget the `tools` slot may occupy before its controls should
 * collapse into a single trigger. `null` until measured (or when rendered
 * outside a {@link FilterBar}) — treat as unconstrained.
 */
const ToolsBudgetContext = createContext<number | null>(null);

/** Read the measured tools budget inside a {@link FilterBar} `tools` slot. */
export function useFilterBarToolsBudget(): number | null {
  return useContext(ToolsBudgetContext);
}

/**
 * Toolbar row that sits above a list / table. Three slots :
 *
 * - `search` — the query field, left-aligned (pair with {@link FilterBarSearch}).
 * - `tools` — the list controls (filters / sorting / columns ; pair with
 *   `TableTools`), right-aligned just left of the actions. The row measures
 *   the space available to this slot and exposes it via
 *   {@link useFilterBarToolsBudget}, so the controls can collapse into a
 *   single trigger when the row gets tight.
 * - `actions` — the primary CTA, right-most. Never collapses.
 *
 * Presentational only — the caller supplies the concrete nodes (i18n stays
 * with the caller).
 */
export function FilterBar({
  search,
  tools,
  actions,
  className,
}: {
  search?: ReactNode;
  tools?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [budget, setBudget] = useState<number | null>(null);

  // Space left for the tools = row minus the search field, the actions, and
  // the inter-group gaps. Re-measured on resize via ResizeObserver.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const GAPS = 24;
    const compute = () => {
      const searchW = searchRef.current?.offsetWidth ?? 0;
      const actionsW = actionsRef.current?.offsetWidth ?? 0;
      setBudget(Math.max(0, row.clientWidth - searchW - actionsW - GAPS));
    };
    compute();
    // ResizeObserver is absent in jsdom / older SSR contexts ; the one-shot
    // compute above is enough there.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(compute);
    ro.observe(row);
    if (actionsRef.current) ro.observe(actionsRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={rowRef} className={cn("flex flex-wrap items-center gap-2", className)}>
      {search != null && (
        <div ref={searchRef} className="flex min-w-0 flex-1 items-center md:flex-none">
          {search}
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        {tools != null && (
          <ToolsBudgetContext.Provider value={budget}>
            <div className="flex items-center gap-2">{tools}</div>
          </ToolsBudgetContext.Provider>
        )}
        {actions != null && (
          <div ref={actionsRef} className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
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
